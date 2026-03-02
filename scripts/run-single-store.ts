#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Run Single Store — Debug/test on one URL
// Usage: pnpm crawl:single https://example.myshopify.com
// ═══════════════════════════════════════════════════════════════

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Crawler } from '../src/crawler/index.js';
import { extractPerceivedPalette } from '../src/extractor/pixel-clustering.js';
import { normalizeExtraction } from '../src/normalizer/index.js';
import { scoreQuality } from '../src/assembler/quality-scorer.js';
import { computeVector, vectorToArray } from '../src/assembler/vector-dedup.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: pnpm crawl:single <URL>');
  process.exit(1);
}

async function main() {
  const crawler = new Crawler();
  await crawler.init();

  try {
    console.log(`\n🔍 Crawling: ${url}\n`);

    const result = await crawler.crawlStore({
      url,
      source: url.includes('myshopify.com') ? 'shopify_theme_demo' : 'curated_d2c',
    });

    console.log(`✅ Crawled in ${result.metadata.load_time_ms}ms`);
    console.log(`   Desktop sections: ${result.desktop.sections.length}`);
    console.log(`   Mobile sections:  ${result.mobile.sections.length}`);
    console.log(`   Reconciled:       ${result.reconciled_sections.length}`);

    // Pixel clustering
    let perceivedPalette;
    if (result.desktop.screenshot.length > 0) {
      console.log('\n🎨 Running pixel clustering on desktop screenshot...');
      perceivedPalette = await extractPerceivedPalette(result.desktop.screenshot);
      console.log(`   Perceived dark: ${perceivedPalette.is_dark_perceived}`);
      console.log(`   Top colors: ${perceivedPalette.perceived_colors.slice(0, 5).map(c => `${c.hex} (${(c.proportion * 100).toFixed(1)}%)`).join(', ')}`);
    }

    // Normalize
    console.log('\n📐 Normalizing...');
    const normalized = normalizeExtraction(result, perceivedPalette);

    // Score
    const quality = scoreQuality(normalized.sections, result);
    normalized.quality_score = quality;

    console.log(`   Quality score: ${quality}/100`);
    console.log(`   Vertical: ${normalized.source.vertical}`);
    console.log(`   Tags: ${normalized.tags.join(', ')}`);
    console.log(`   Typography: ${normalized.typography.heading_font} / ${normalized.typography.body_font}`);
    console.log(`   Palette: bg=${normalized.palette.background} accent=${normalized.palette.accent} dark=${normalized.palette.is_dark_theme}`);

    // Sections
    console.log('\n📋 Sections:');
    normalized.sections.forEach((s, i) => {
      console.log(`   ${i}. ${s.type}${s.detected_variant ? ` (${s.detected_variant})` : ''} — conf=${(s.confidence * 100).toFixed(0)}% dark=${s.is_dark} h=${s.height_ratio.toFixed(2)}`);
    });

    // Reconciled details
    console.log('\n📱 Reconciled (mobile priority):');
    result.reconciled_sections.forEach((s, i) => {
      console.log(`   ${i}. ${s.type} — mobile=${s.on_mobile} desktop=${s.on_desktop} required=${s.required} hero_candidate=${s.is_primary_hero_candidate || false}`);
    });

    // Vector
    const vec = vectorToArray(computeVector(normalized));
    console.log(`\n🧬 Vector (42-dim): [${vec.map(v => v.toFixed(2)).join(', ')}]`);

    // Save outputs
    const outDir = join(process.cwd(), 'output', 'raw-extractions');
    mkdirSync(outDir, { recursive: true });
    const filename = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_');
    writeFileSync(join(outDir, `${filename}.json`), JSON.stringify(normalized, null, 2));
    console.log(`\n💾 Saved to output/raw-extractions/${filename}.json`);

    // Save screenshots
    if (result.desktop.screenshot.length > 0) {
      const ssDir = join(process.cwd(), 'output', 'screenshots');
      mkdirSync(join(ssDir, 'desktop'), { recursive: true });
      mkdirSync(join(ssDir, 'mobile'), { recursive: true });
      writeFileSync(join(ssDir, 'desktop', `${filename}.png`), result.desktop.screenshot);
      writeFileSync(join(ssDir, 'mobile', `${filename}.png`), result.mobile.screenshot);
      console.log(`📸 Screenshots saved`);
    }

  } finally {
    await crawler.destroy();
  }
}

main().catch(console.error);
