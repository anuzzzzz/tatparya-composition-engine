#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Run Full Pipeline
// crawl → extract → normalize → score → validate → dedup → assemble
// Reads URL lists from sources/, outputs composition-library.json
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Crawler } from '../src/crawler/index.js';
import { extractPerceivedPalette } from '../src/extractor/pixel-clustering.js';
import { normalizeExtraction } from '../src/normalizer/index.js';
import { scoreQuality } from '../src/assembler/quality-scorer.js';
import { validateWithVision } from '../src/validator/vision-validator.js';
import { saveFlaggedComposition } from '../src/validator/index.js';
import { assembleLibrary } from '../src/assembler/library-builder.js';
import type { CrawlTarget, NormalizedComposition } from '../src/shared/types.js';

const VISION_THRESHOLD = 40; // Only validate compositions scoring above this
const ENABLE_VISION = process.env.ENABLE_VISION === 'true';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Tatparya Composition Engine — Full Pipeline');
  console.log('═══════════════════════════════════════════\n');

  // Load URL lists
  const targets: CrawlTarget[] = [];
  const sourcesDir = join(process.cwd(), 'sources');

  for (const file of ['shopify-theme-demos.json', 'top-shopify-stores.json', 'indian-d2c-brands.json']) {
    const path = join(sourcesDir, file);
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as CrawlTarget[];
      targets.push(...data);
      console.log(`📂 Loaded ${data.length} targets from ${file}`);
    }
  }

  if (targets.length === 0) {
    console.error('❌ No targets found. Add URL lists to sources/ directory.');
    console.log('\nExpected format (sources/shopify-theme-demos.json):');
    console.log(JSON.stringify([
      { url: 'https://example.myshopify.com', source: 'shopify_theme_demo', vertical: 'fashion' },
    ], null, 2));
    process.exit(1);
  }

  console.log(`\n🎯 Total targets: ${targets.length}\n`);

  // Crawl
  const crawler = new Crawler();
  await crawler.init();

  const compositions: NormalizedComposition[] = [];
  let crawled = 0, errors = 0, validated = 0, flagged = 0;

  try {
    await crawler.crawlBatch(
      targets,
      async (result, idx) => {
        crawled++;
        const progress = `[${crawled}/${targets.length}]`;

        try {
          // Pixel clustering
          let perceivedPalette;
          if (result.desktop.screenshot.length > 0) {
            perceivedPalette = await extractPerceivedPalette(result.desktop.screenshot);
          }

          // Normalize
          const normalized = normalizeExtraction(result, perceivedPalette);

          // Score
          const quality = scoreQuality(normalized.sections, result);
          normalized.quality_score = quality;

          // Vision validation (if enabled and score > threshold)
          if (ENABLE_VISION && quality > VISION_THRESHOLD && result.desktop.screenshot.length > 0) {
            try {
              const visionResult = await validateWithVision(
                result.desktop.screenshot,
                normalized.sections
              );
              normalized.quality_score = scoreQuality(normalized.sections, result, visionResult);
              validated++;

              if (visionResult.flagged_for_review) {
                saveFlaggedComposition(normalized, visionResult, result.desktop.screenshot);
                flagged++;
              }

              // Override vertical if vision is more confident
              if (visionResult.detected_vertical && visionResult.detected_vertical !== 'general') {
                normalized.source.vertical = visionResult.detected_vertical;
              }

              // Merge vibe tags
              normalized.tags = [...new Set([...normalized.tags, ...visionResult.detected_vibe])];
            } catch (vErr) {
              console.warn(`${progress} ⚠️ Vision validation failed: ${vErr}`);
            }
          }

          compositions.push(normalized);
          console.log(
            `${progress} ✅ ${result.target.url} — ` +
            `q=${normalized.quality_score} v=${normalized.source.vertical} ` +
            `s=${normalized.sections.length} tags=[${normalized.tags.slice(0, 3).join(',')}]`
          );
        } catch (normErr) {
          console.error(`${progress} ⚠️ Normalization failed: ${normErr}`);
        }
      },
      (error, target, idx) => {
        errors++;
        console.error(`[${crawled + errors}/${targets.length}] ❌ ${target.url}: ${error.message}`);
      }
    );
  } finally {
    await crawler.destroy();
  }

  // Assemble library
  console.log('\n═══════════════════════════════════════════');
  console.log(' Assembling Library');
  console.log('═══════════════════════════════════════════\n');

  const library = assembleLibrary(compositions);

  // Save
  const outDir = join(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'composition-library.json'), JSON.stringify(library, null, 2));

  // Print summary
  console.log('📊 Pipeline Summary:');
  console.log(`   Stores crawled:      ${crawled}`);
  console.log(`   Crawl errors:        ${errors}`);
  console.log(`   Compositions:        ${compositions.length}`);
  console.log(`   After quality filter: ${library.stats.compositions_after_quality_filter}`);
  console.log(`   After dedup:         ${library.stats.compositions_after_dedup}`);
  console.log(`   Total archetypes:    ${library.stats.total_archetypes}`);
  if (ENABLE_VISION) {
    console.log(`   Vision validated:    ${validated}`);
    console.log(`   Flagged for review:  ${flagged}`);
  }
  console.log('\n   By vertical:');
  for (const [v, count] of Object.entries(library.stats.by_vertical)) {
    const archetypeCount = library.archetypes[v]?.length || 0;
    console.log(`     ${v}: ${count} compositions → ${archetypeCount} archetypes`);
  }

  console.log(`\n💾 Saved to output/composition-library.json`);
  console.log(`   File size: ${(JSON.stringify(library).length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
