#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { CompositionLibrary } from '../src/shared/types.js';
import { SECTION_TYPES } from '../src/shared/section-types.js';

const path = join(process.cwd(), 'output', 'composition-library.json');
if (!existsSync(path)) { console.error('❌ No library found.'); process.exit(1); }

const lib: CompositionLibrary = JSON.parse(readFileSync(path, 'utf-8'));
let errors = 0;

function check(condition: boolean, msg: string) {
  if (!condition) { console.error(`  ❌ ${msg}`); errors++; }
  else { console.log(`  ✅ ${msg}`); }
}

console.log('\n🔍 Validating composition-library.json\n');
check(lib.version === '3.0.0', `Version is 3.0.0 (got ${lib.version})`);
check(!!lib.generated_at, 'Has generated_at timestamp');
check(lib.stats.total_archetypes > 0 || lib.compositions.length === 0, 'Has archetypes or empty library');
check(Array.isArray(lib.compositions), 'Compositions is array');

const validTypes = new Set([...SECTION_TYPES, 'unknown']);
for (const comp of lib.compositions) {
  for (const s of comp.sections) {
    if (!validTypes.has(s.type)) {
      console.error(`  ⚠️ Unknown section type "${s.type}" in ${comp.id}`);
    }
  }
}

for (const [vertical, archs] of Object.entries(lib.archetypes)) {
  check(archs.length <= 15, `${vertical}: ${archs.length} archetypes (max 15)`);
  for (const a of archs) {
    check(a.vector.length === 42, `${a.id}: vector has 42 dims (got ${a.vector.length})`);
    check(a.cluster_size > 0, `${a.id}: cluster_size > 0`);
  }
}

console.log(`\n${errors === 0 ? '✅ All checks passed' : `❌ ${errors} errors found`}\n`);
process.exit(errors > 0 ? 1 : 0);
