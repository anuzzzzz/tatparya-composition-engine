#!/usr/bin/env tsx
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const dir = join(process.cwd(), 'output', 'review-queue');
try {
  const files = readdirSync(dir).filter(f => f.endsWith('_review.json'));
  if (files.length === 0) { console.log('✅ No flagged compositions to review.'); process.exit(0); }

  console.log(`\n🔍 ${files.length} flagged compositions:\n`);
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    const comp = data.composition;
    const vision = data.vision_result;
    console.log(`  📄 ${comp.id} — ${comp.source.url}`);
    console.log(`     DOM sections: ${comp.sections.map((s: any) => s.type).join(', ')}`);
    console.log(`     Vision sees:  ${vision.detected_sections.join(', ')}`);
    console.log(`     Vibe: ${vision.detected_vibe.join(', ')}`);
    console.log(`     Vertical: ${vision.detected_vertical}`);
    console.log(`     Disagreements: ${vision.disagreements.length}`);
    vision.disagreements.forEach((d: any) => {
      console.log(`       pos ${d.position}: DOM="${d.dom_said}" → Vision="${d.vision_says}"`);
    });
    console.log('');
  }
} catch { console.log('No review queue directory found.'); }
