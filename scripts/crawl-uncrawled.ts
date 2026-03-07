#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Crawl Uncrawled — Incremental crawl for stores missing from
// composition-library.json. Merges results into existing library.
//
// Usage:
//   npx tsx scripts/crawl-uncrawled.ts
//   npx tsx scripts/crawl-uncrawled.ts sources/indian-d2c-brands.json
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Crawler } from '../src/crawler/index.js';
import { extractPerceivedPalette } from '../src/extractor/pixel-clustering.js';
import { normalizeExtraction } from '../src/normalizer/index.js';
import { scoreQuality } from '../src/assembler/quality-scorer.js';
import { assembleLibrary } from '../src/assembler/library-builder.js';
import type { CrawlTarget, NormalizedComposition, CompositionLibrary } from '../src/shared/types.js';

interface SkippedStore {
  url: string;
  reason: string;
  builder?: string;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Crawl Uncrawled — Incremental Pipeline');
  console.log('═══════════════════════════════════════════\n');

  const outDir = join(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  // ── Load existing library ──
  const libraryPath = join(outDir, 'composition-library.json');
  let existingLibrary: CompositionLibrary | null = null;
  const alreadyCrawledUrls = new Set<string>();

  if (existsSync(libraryPath)) {
    existingLibrary = JSON.parse(readFileSync(libraryPath, 'utf-8'));
    for (const comp of existingLibrary!.compositions) {
      alreadyCrawledUrls.add(comp.source_url);
    }
    console.log(`📚 Existing library: ${existingLibrary!.compositions.length} compositions`);
    console.log(`   Already crawled: ${alreadyCrawledUrls.size} URLs\n`);
  } else {
    console.log('📚 No existing library found — will create new one\n');
  }

  // ── Load targets ──
  const specificFile = process.argv[2];
  const allTargets: CrawlTarget[] = [];

  if (specificFile) {
    const data = JSON.parse(readFileSync(specificFile, 'utf-8')) as CrawlTarget[];
    allTargets.push(...data);
    console.log(`📂 Loaded ${data.length} targets from ${specificFile}`);
  } else {
    const sourcesDir = join(process.cwd(), 'sources');
    for (const file of ['shopify-theme-demos.json', 'top-shopify-stores.json', 'indian-d2c-brands.json']) {
      const path = join(sourcesDir, file);
      if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, 'utf-8')) as CrawlTarget[];
        allTargets.push(...data);
        console.log(`📂 Loaded ${data.length} targets from ${file}`);
      }
    }
  }

  // ── Filter to uncrawled only ──
  const targets = allTargets.filter(t => !alreadyCrawledUrls.has(t.url));
  console.log(`\n🎯 Uncrawled targets: ${targets.length} (out of ${allTargets.length} total)\n`);

  if (targets.length === 0) {
    console.log('✅ All targets already crawled. Nothing to do.');
    return;
  }

  // ── Crawl ──
  const crawler = new Crawler();
  await crawler.init();

  const newCompositions: NormalizedComposition[] = [];
  const skipped: SkippedStore[] = [];
  let crawled = 0, errors = 0;

  try {
    await crawler.crawlBatch(
      targets,
      async (result, idx) => {
        crawled++;
        const progress = `[${crawled}/${targets.length}]`;

        // Check skip reasons
        if ((result.metadata as any).skip_reason) {
          const reason = (result.metadata as any).skip_reason;
          const builder = (result.metadata as any).iframe_builder || 'unknown';
          skipped.push({ url: result.target.url, reason, builder });
          console.log(`${progress} ⏭️  ${result.target.url} — SKIPPED (${reason})`);
          return;
        }

        if (result.reconciled_sections.length < 2) {
          skipped.push({
            url: result.target.url,
            reason: `too_few_sections:${result.reconciled_sections.length}`,
          });
          console.log(`${progress} ⏭️  ${result.target.url} — SKIPPED (${result.reconciled_sections.length} sections)`);
          return;
        }

        try {
          // Pixel clustering
          let perceivedPalette;
          if (result.desktop.screenshot.length > 0) {
            perceivedPalette = await extractPerceivedPalette(result.desktop.screenshot);
          }

          // Normalize
          const normalized = normalizeExtraction(result, perceivedPalette);

          // Score
          normalized.quality_score = scoreQuality(normalized.sections, result);

          newCompositions.push(normalized);
          console.log(
            `${progress} ✅ ${result.target.url} — ` +
            `q=${normalized.quality_score} v=${normalized.source.vertical} ` +
            `sv=${normalized.source.sub_vertical || '-'} ` +
            `s=${normalized.sections.length} tags=[${normalized.tags.slice(0, 3).join(',')}]`
          );
        } catch (normErr) {
          console.error(`${progress} ⚠️ Normalization failed: ${normErr}`);
        }
      },
      (error, target) => {
        errors++;
        console.error(`[${crawled + errors}/${targets.length}] ❌ ${target.url}: ${error.message}`);
      }
    );
  } finally {
    await crawler.destroy();
  }

  // ── Merge with existing compositions ──
  console.log('\n═══════════════════════════════════════════');
  console.log(' Merging & Reassembling Library');
  console.log('═══════════════════════════════════════════\n');

  // We need to rebuild from all normalized compositions.
  // The existing library only has templates (lossy), so we re-normalize
  // existing templates back into a minimal NormalizedComposition shape,
  // then combine with the new ones and reassemble.

  // Convert existing templates to NormalizedComposition (best-effort)
  const existingCompositions: NormalizedComposition[] = [];
  if (existingLibrary) {
    for (const tmpl of existingLibrary.compositions) {
      existingCompositions.push({
        id: tmpl.id,
        source: {
          url: tmpl.source_url,
          type: tmpl.source_type as any,
          vertical: tmpl.vertical,
          sub_vertical: tmpl.sub_vertical,
        },
        sections: tmpl.sections.map(s => ({
          type: s.type,
          detected_variant: s.variant,
          confidence: s.required ? 0.8 : 0.5,
          position: s.position,
          is_dark: s.background_hint === 'dark',
          height_ratio: 0.15,
          content_hints: { has_carousel: false, grid_columns: 1 },
        })),
        palette: {
          background: tmpl.palette_hint?.background || '#FFFFFF',
          surface: tmpl.palette_hint?.surface || '#F5F5F5',
          text_primary: '#1A1A1A',
          text_secondary: '#666666',
          accent: tmpl.palette_hint?.accent || '#000000',
          is_dark_theme: false,
          proportions: tmpl.palette_hint?.proportions,
          indian_color_signals: tmpl.palette_hint?.indian_signals,
        },
        typography: {
          heading_font: tmpl.typography_hint?.heading_font || 'system-ui',
          body_font: tmpl.typography_hint?.body_font || 'system-ui',
        },
        quality_score: tmpl.quality_score,
        effective_score: tmpl.effective_score,
        section_count: tmpl.sections.length,
        dark_section_rhythm: tmpl.sections.map(s => s.background_hint === 'dark' ? 'D' : 'L').join(''),
        tags: tmpl.tags,
        crawled_at: tmpl.crawled_at,
      });
    }
  }

  // Backfill sub_vertical for existing compositions from v2 source file
  const sourceFile = join(process.cwd(), 'sources', 'indian-d2c-brands.json');
  if (existsSync(sourceFile)) {
    const sourceData = JSON.parse(readFileSync(sourceFile, 'utf-8')) as CrawlTarget[];
    const subVerticalMap = new Map<string, string>();
    for (const t of sourceData) {
      if (t.sub_vertical) subVerticalMap.set(t.url, t.sub_vertical);
    }

    for (const comp of existingCompositions) {
      if (!comp.source.sub_vertical) {
        const sv = subVerticalMap.get(comp.source.url);
        if (sv) comp.source.sub_vertical = sv;
      }
    }
    console.log(`📝 Backfilled sub_vertical for existing compositions from v2 source file`);
  }

  const allCompositions = [...existingCompositions, ...newCompositions];
  console.log(`📊 Total compositions: ${existingCompositions.length} existing + ${newCompositions.length} new = ${allCompositions.length}`);

  const library = assembleLibrary(allCompositions);

  // Save
  writeFileSync(join(outDir, 'composition-library.json'), JSON.stringify(library, null, 2));

  // Save skipped
  if (skipped.length > 0) {
    // Merge with existing skipped
    const existingSkippedPath = join(outDir, 'skipped-stores.json');
    let allSkipped = skipped;
    if (existsSync(existingSkippedPath)) {
      const prev = JSON.parse(readFileSync(existingSkippedPath, 'utf-8'));
      allSkipped = [...prev, ...skipped];
    }
    writeFileSync(join(outDir, 'skipped-stores.json'), JSON.stringify(allSkipped, null, 2));
  }

  // ── Summary ──
  console.log('\n📊 Incremental Crawl Summary:');
  console.log(`   New stores crawled:    ${crawled}`);
  console.log(`   Crawl errors:          ${errors}`);
  console.log(`   Skipped:               ${skipped.length}`);
  console.log(`   New compositions:      ${newCompositions.length}`);
  console.log(`   Total in library:      ${library.compositions.length}`);
  console.log(`   Total archetypes:      ${library.stats.total_archetypes}`);
  console.log('\n   By vertical:');
  for (const [v, count] of Object.entries(library.stats.by_vertical)) {
    console.log(`     ${v}: ${count}`);
  }
  console.log(`\n💾 Saved to output/composition-library.json`);
  console.log(`   File size: ${(JSON.stringify(library).length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
