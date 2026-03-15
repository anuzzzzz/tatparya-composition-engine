#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// PDP Frequency Matrix Builder
//
// Reads pdp-structural-success.json and builds a per-vertical
// frequency matrix showing which PDP elements appear in what
// percentage of stores per vertical and sub-vertical.
//
// Output feeds directly into Tatparya's storefront rendering:
// - Elements >80% → always show (expected by shoppers)
// - Elements 50-80% → show by default, toggleable
// - Elements 30-50% → optional, AI decides
// - Elements <30% → hidden unless seller enables
//
// Usage:
//   npx tsx scripts/pdp-frequency-matrix.ts
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface PDPElement {
  type: string;
  present: boolean;
  details?: Record<string, any>;
}

interface PDPResult {
  url: string;
  brand: string;
  vertical: string;
  sub_vertical: string;
  success: boolean;
  elements: PDPElement[];
}

interface FrequencyRow {
  element: string;
  overall_pct: number;
  by_vertical: Record<string, number>;
  by_sub_vertical: Record<string, number>;
  // Collected details patterns (what styles are most common)
  common_details: Record<string, any>;
}

function main() {
  const inputPath = join(process.cwd(), 'output', 'pdp-structural-success.json');
  if (!existsSync(inputPath)) {
    console.error('❌ output/pdp-structural-success.json not found. Run scrape-pdp-structural.ts first.');
    process.exit(1);
  }

  const results: PDPResult[] = JSON.parse(readFileSync(inputPath, 'utf-8'));
  console.log(`📊 Building PDP frequency matrix from ${results.length} stores...\n`);

  // Count stores per vertical and sub-vertical
  const verticalCounts: Record<string, number> = {};
  const subVerticalCounts: Record<string, number> = {};
  for (const r of results) {
    verticalCounts[r.vertical] = (verticalCounts[r.vertical] || 0) + 1;
    subVerticalCounts[r.sub_vertical] = (subVerticalCounts[r.sub_vertical] || 0) + 1;
  }

  // Collect all unique element types
  const allTypes = new Set<string>();
  for (const r of results) {
    for (const el of r.elements) {
      allTypes.add(el.type);
    }
  }

  // Build frequency matrix
  const matrix: FrequencyRow[] = [];

  for (const elementType of allTypes) {
    // Overall count
    let overallCount = 0;

    // Per-vertical counts
    const verticalPresent: Record<string, number> = {};
    const subVerticalPresent: Record<string, number> = {};

    // Collect details for pattern analysis
    const detailsCollection: Record<string, any>[] = [];

    for (const r of results) {
      const el = r.elements.find(e => e.type === elementType);
      if (el?.present) {
        overallCount++;
        verticalPresent[r.vertical] = (verticalPresent[r.vertical] || 0) + 1;
        subVerticalPresent[r.sub_vertical] = (subVerticalPresent[r.sub_vertical] || 0) + 1;
        if (el.details && Object.keys(el.details).length > 0) {
          detailsCollection.push(el.details);
        }
      }
    }

    // Calculate percentages
    const overallPct = Math.round((overallCount / results.length) * 100);

    const byVertical: Record<string, number> = {};
    for (const [v, count] of Object.entries(verticalPresent)) {
      byVertical[v] = Math.round((count / (verticalCounts[v] || 1)) * 100);
    }

    const bySubVertical: Record<string, number> = {};
    for (const [sv, count] of Object.entries(subVerticalPresent)) {
      bySubVertical[sv] = Math.round((count / (subVerticalCounts[sv] || 1)) * 100);
    }

    // Analyze common details patterns
    const commonDetails = analyzeDetails(detailsCollection);

    matrix.push({
      element: elementType,
      overall_pct: overallPct,
      by_vertical: byVertical,
      by_sub_vertical: bySubVertical,
      common_details: commonDetails,
    });
  }

  // Sort by overall frequency descending
  matrix.sort((a, b) => b.overall_pct - a.overall_pct);

  // ── Print matrix ──
  const verticals = Object.keys(verticalCounts).sort();

  console.log('PDP Element Frequency Matrix');
  console.log('═'.repeat(80));
  console.log('');

  // Header
  const header = 'Element'.padEnd(28) + 'Overall'.padStart(8) + verticals.map(v => v.padStart(12)).join('');
  console.log(header);
  console.log('─'.repeat(header.length));

  for (const row of matrix) {
    const cols = verticals.map(v => {
      const pct = row.by_vertical[v];
      return pct !== undefined ? `${pct}%`.padStart(12) : '—'.padStart(12);
    }).join('');

    const tier = row.overall_pct >= 80 ? '██' : row.overall_pct >= 50 ? '▓▓' : row.overall_pct >= 30 ? '░░' : '  ';
    console.log(`${tier} ${row.element.padEnd(25)} ${(row.overall_pct + '%').padStart(7)}${cols}`);
  }

  console.log('');
  console.log('Legend: ██ ≥80% (must-have) | ▓▓ 50-79% (expected) | ░░ 30-49% (optional) | <30% (rare)');
  console.log('');

  // ── Tier summary ──
  console.log('\nTier Breakdown:');
  console.log(`  Must-have (≥80%):  ${matrix.filter(r => r.overall_pct >= 80).map(r => r.element).join(', ')}`);
  console.log(`  Expected (50-79%): ${matrix.filter(r => r.overall_pct >= 50 && r.overall_pct < 80).map(r => r.element).join(', ')}`);
  console.log(`  Optional (30-49%): ${matrix.filter(r => r.overall_pct >= 30 && r.overall_pct < 50).map(r => r.element).join(', ')}`);
  console.log(`  Rare (<30%):       ${matrix.filter(r => r.overall_pct < 30).map(r => r.element).join(', ')}`);

  // ── Per-vertical recommendations ──
  console.log('\n\nPer-Vertical Recommendations:');
  for (const vertical of verticals) {
    const storeCount = verticalCounts[vertical] || 0;
    console.log(`\n  ${vertical} (${storeCount} stores):`);
    const verticalElements = matrix
      .filter(r => r.by_vertical[vertical] !== undefined)
      .sort((a, b) => (b.by_vertical[vertical] || 0) - (a.by_vertical[vertical] || 0));
    for (const row of verticalElements) {
      const pct = row.by_vertical[vertical] || 0;
      const tier = pct >= 80 ? 'MUST' : pct >= 50 ? 'EXPECTED' : pct >= 30 ? 'optional' : 'rare';
      console.log(`    ${tier.padEnd(10)} ${row.element} (${pct}%)`);
    }
  }

  // ── Save ──
  const output = {
    generated_at: new Date().toISOString(),
    total_stores: results.length,
    store_counts: verticalCounts,
    sub_vertical_counts: subVerticalCounts,
    matrix: matrix,
    // Convenience: pre-computed per-vertical must-haves
    must_have_by_vertical: Object.fromEntries(
      verticals.map(v => [
        v,
        matrix.filter(r => (r.by_vertical[v] || 0) >= 80).map(r => r.element),
      ])
    ),
    expected_by_vertical: Object.fromEntries(
      verticals.map(v => [
        v,
        matrix.filter(r => (r.by_vertical[v] || 0) >= 50 && (r.by_vertical[v] || 0) < 80).map(r => r.element),
      ])
    ),
  };

  const outPath = join(process.cwd(), 'output', 'pdp-frequency-matrix.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 ${outPath}`);
  console.log('\nThis file should be copied to packages/api/src/lib/ in the main repo');
  console.log('and loaded by the PDP rendering logic to decide which elements to show.');
}

// ═══════════════════════════════════════════════════════════════
// Detail pattern analysis — find most common styles/formats
// ═══════════════════════════════════════════════════════════════

function analyzeDetails(details: Record<string, any>[]): Record<string, any> {
  if (details.length === 0) return {};

  const result: Record<string, any> = {};

  // For each detail field, find the most common value
  const fieldValues: Record<string, any[]> = {};
  for (const d of details) {
    for (const [key, value] of Object.entries(d)) {
      if (!fieldValues[key]) fieldValues[key] = [];
      fieldValues[key].push(value);
    }
  }

  for (const [field, values] of Object.entries(fieldValues)) {
    if (values.length === 0) continue;

    // For string values, find the mode
    if (typeof values[0] === 'string') {
      const counts: Record<string, number> = {};
      for (const v of values) {
        counts[v] = (counts[v] || 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      result[field] = {
        most_common: sorted[0]?.[0],
        distribution: Object.fromEntries(sorted.slice(0, 5)),
      };
    }
    // For boolean, show true percentage
    else if (typeof values[0] === 'boolean') {
      const trueCount = values.filter(v => v === true).length;
      result[field] = { true_pct: Math.round((trueCount / values.length) * 100) };
    }
    // For numbers, show average
    else if (typeof values[0] === 'number') {
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      result[field] = { average: Math.round(avg * 10) / 10, min: Math.min(...values), max: Math.max(...values) };
    }
    // For arrays, flatten and count
    else if (Array.isArray(values[0])) {
      const flat = values.flat();
      const counts: Record<string, number> = {};
      for (const v of flat) {
        const key = String(v);
        counts[key] = (counts[key] || 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      result[field] = { most_common: sorted.slice(0, 5).map(([k]) => k) };
    }
  }

  return result;
}

main();
