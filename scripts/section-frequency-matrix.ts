#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Section Frequency Matrix — per sub_vertical
//
// Reads composition-library.json and the v2 source file,
// counts section type occurrences per sub_vertical.
// Output feeds directly into blueprint definitions.
//
// Usage:
//   npx tsx scripts/section-frequency-matrix.ts
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { SECTION_TYPES } from '../src/shared/section-types.js';
import type { CompositionLibrary, CrawlTarget } from '../src/shared/types.js';

interface FrequencyRow {
  [sectionType: string]: number;
}

interface FrequencyMatrix {
  [subVertical: string]: FrequencyRow;
}

interface MatrixOutput {
  generated_at: string;
  total_compositions: number;
  sub_verticals_count: number;
  section_types: string[];
  matrix: FrequencyMatrix;
  store_counts: Record<string, number>;
}

function main() {
  const outDir = join(process.cwd(), 'output');
  const libraryPath = join(outDir, 'composition-library.json');

  if (!existsSync(libraryPath)) {
    console.error('❌ No composition-library.json found. Run the crawler first.');
    process.exit(1);
  }

  // Load library
  const library: CompositionLibrary = JSON.parse(readFileSync(libraryPath, 'utf-8'));
  console.log(`📚 Loaded ${library.compositions.length} compositions from library\n`);

  // Build URL → sub_vertical lookup from source files
  const subVerticalMap = new Map<string, string>();
  const sourcesDir = join(process.cwd(), 'sources');

  for (const file of ['indian-d2c-brands.json', 'top-shopify-stores.json', 'shopify-theme-demos.json']) {
    const path = join(sourcesDir, file);
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as CrawlTarget[];
      for (const t of data) {
        if (t.sub_vertical) {
          subVerticalMap.set(t.url, t.sub_vertical);
        }
      }
    }
  }

  console.log(`📂 Sub-vertical mappings: ${subVerticalMap.size} URLs\n`);

  // Build the frequency matrix
  const matrix: FrequencyMatrix = {};
  const storeCounts: Record<string, number> = {};

  for (const comp of library.compositions) {
    // Get sub_vertical from composition or source file lookup
    const subVertical = comp.sub_vertical
      || subVerticalMap.get(comp.source_url)
      || `${comp.vertical}_general`;

    // Initialize sub_vertical row if needed
    if (!matrix[subVertical]) {
      matrix[subVertical] = {};
      for (const type of SECTION_TYPES) {
        matrix[subVertical][type] = 0;
      }
      storeCounts[subVertical] = 0;
    }

    storeCounts[subVertical]++;

    // Count each section type in this composition
    for (const section of comp.sections) {
      const type = section.type;
      if (type in matrix[subVertical]) {
        matrix[subVertical][type]++;
      }
    }
  }

  // Sort sub_verticals alphabetically
  const sortedMatrix: FrequencyMatrix = {};
  for (const sv of Object.keys(matrix).sort()) {
    sortedMatrix[sv] = matrix[sv];
  }

  // Output
  const output: MatrixOutput = {
    generated_at: new Date().toISOString(),
    total_compositions: library.compositions.length,
    sub_verticals_count: Object.keys(sortedMatrix).length,
    section_types: [...SECTION_TYPES],
    matrix: sortedMatrix,
    store_counts: storeCounts,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'section-frequency-matrix.json'), JSON.stringify(output, null, 2));

  // ── Console Summary ──
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Section Frequency Matrix');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const subVerticals = Object.keys(sortedMatrix);

  for (const sv of subVerticals) {
    const row = sortedMatrix[sv];
    const count = storeCounts[sv];
    const nonZero = Object.entries(row)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);

    console.log(`\n  ${sv} (${count} stores):`);
    for (const [type, freq] of nonZero) {
      const pct = ((freq / count) * 100).toFixed(0);
      const bar = '█'.repeat(Math.min(freq, 30));
      console.log(`    ${type.padEnd(22)} ${String(freq).padStart(3)} (${pct.padStart(3)}%)  ${bar}`);
    }
  }

  // Cross-vertical "essential sections" — appear in >70% of stores in a sub_vertical
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log(' Essential Sections (>70% of stores in sub_vertical)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const sv of subVerticals) {
    const row = sortedMatrix[sv];
    const count = storeCounts[sv];
    if (count < 2) continue; // Skip sub_verticals with <2 stores

    const essential = Object.entries(row)
      .filter(([, freq]) => freq / count >= 0.7)
      .sort((a, b) => b[1] - a[1])
      .map(([type, freq]) => `${type}(${((freq / count) * 100).toFixed(0)}%)`);

    if (essential.length > 0) {
      console.log(`  ${sv}: ${essential.join(', ')}`);
    }
  }

  console.log(`\n💾 Saved to output/section-frequency-matrix.json`);
  console.log(`   ${subVerticals.length} sub_verticals × ${SECTION_TYPES.length} section types`);
}

main();
