// ═══════════════════════════════════════════════════════════════
// Tatparya Composition Engine — Main Entry Point
// ═══════════════════════════════════════════════════════════════

export * from './shared/index.js';
export { Crawler } from './crawler/index.js';
export { getExtractorScript, extractPerceivedPalette } from './extractor/index.js';
export { normalizeExtraction } from './normalizer/index.js';
export { validateWithVision } from './validator/vision-validator.js';
export { saveFlaggedComposition } from './validator/index.js';
export {
  scoreQualityHeuristic,
  scoreQuality,
  computeVector,
  vectorToArray,
  cosineSimilarity,
  weightedCosineSimilarity,
  structuralFingerprint,
  deduplicateCompositions,
  applyTimeDecay,
  distillArchetypes,
  assembleLibrary,
  selectCompositions,
} from './assembler/index.js';
