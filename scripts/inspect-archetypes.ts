#!/usr/bin/env tsx
// View archetype clusters for a vertical
// Usage: pnpm inspect:archetypes [vertical]

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { CompositionLibrary } from '../src/shared/types.js';

const libraryPath = join(process.cwd(), 'output', 'composition-library.json');
if (!existsSync(libraryPath)) {
  console.error('❌ No composition-library.json found. Run the pipeline first.');
  process.exit(1);
}

const library: CompositionLibrary = JSON.parse(readFileSync(libraryPath, 'utf-8'));
const vertical = process.argv[2];

console.log(`\n📊 Composition Library v${library.version}`);
console.log(`   Generated: ${library.generated_at}`);
console.log(`   Total archetypes: ${library.stats.total_archetypes}\n`);

const verticals = vertical ? [vertical] : Object.keys(library.archetypes);

for (const v of verticals) {
  const archs = library.archetypes[v];
  if (!archs) { console.log(`   ⚠️ No archetypes for "${v}"`); continue; }

  console.log(`\n═══ ${v.toUpperCase()} (${archs.length} archetypes) ═══\n`);

  for (const arch of archs) {
    console.log(`  🏛️  ${arch.name}`);
    console.log(`     ID: ${arch.id}`);
    console.log(`     Cluster size: ${arch.cluster_size} stores`);
    console.log(`     Quality: ${arch.quality_score}/100`);
    console.log(`     Sections: ${arch.section_pattern.map(s => s.type).join(' → ')}`);
    console.log(`     Tags: ${arch.tags.join(', ')}`);
    console.log(`     Palette: gold=${arch.palette_centroid.avg_gold_proportion.toFixed(2)} maroon=${arch.palette_centroid.avg_maroon_proportion.toFixed(2)} dark=${(arch.palette_centroid.dark_theme_ratio * 100).toFixed(0)}%`);
    console.log(`     Source: ${arch.representative_source}`);
    console.log('');
  }
}
