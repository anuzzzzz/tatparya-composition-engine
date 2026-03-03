#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Filter Sources — Remove dead URLs from source files
// Uses output/url-health-check.json to filter
//
// Usage: npx tsx scripts/filter-sources.ts
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const healthCheckPath = join(process.cwd(), 'output', 'url-health-check.json');

if (!existsSync(healthCheckPath)) {
  console.log('❌ No health check results found. Run check-urls.ts first on each source file.');
  process.exit(1);
}

const healthResults = JSON.parse(readFileSync(healthCheckPath, 'utf-8'));
const deadUrls = new Set(
  healthResults
    .filter((r: any) => !r.status.startsWith('✅') && !r.status.startsWith('⚠️ PARTIAL'))
    .map((r: any) => r.url)
);

console.log(`Health check: ${healthResults.length} total, ${deadUrls.size} dead\n`);

const sourcesDir = join(process.cwd(), 'sources');
const files = ['shopify-theme-demos.json', 'top-shopify-stores.json', 'indian-d2c-brands.json'];

let totalBefore = 0, totalAfter = 0;

for (const file of files) {
  const path = join(sourcesDir, file);
  if (!existsSync(path)) continue;

  const data = JSON.parse(readFileSync(path, 'utf-8'));
  const before = data.length;
  const filtered = data.filter((t: any) => !deadUrls.has(t.url));
  const after = filtered.length;

  totalBefore += before;
  totalAfter += after;

  // Backup original
  writeFileSync(path.replace('.json', '.backup.json'), JSON.stringify(data, null, 2));
  // Write filtered
  writeFileSync(path, JSON.stringify(filtered, null, 2));

  console.log(`${file}: ${before} → ${after} (removed ${before - after})`);
}

console.log(`\nTotal: ${totalBefore} → ${totalAfter} URLs ready for pipeline`);
console.log('Backups saved as *.backup.json');
