import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { NormalizedComposition, VisionValidationResult } from '../shared/types.js';

const REVIEW_DIR = join(process.cwd(), 'output', 'review-queue');

export function saveFlaggedComposition(
  comp: NormalizedComposition,
  visionResult: VisionValidationResult,
  screenshot?: Buffer
): void {
  mkdirSync(REVIEW_DIR, { recursive: true });
  const filename = `${comp.id}_review.json`;
  writeFileSync(join(REVIEW_DIR, filename), JSON.stringify({
    composition: comp,
    vision_result: visionResult,
    flagged_at: new Date().toISOString(),
  }, null, 2));
  if (screenshot) {
    writeFileSync(join(REVIEW_DIR, `${comp.id}_screenshot.png`), screenshot);
  }
}
