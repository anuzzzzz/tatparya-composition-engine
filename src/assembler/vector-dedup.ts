// ═══════════════════════════════════════════════════════════════
// Vector-Based Deduplication Pipeline
// 
// 1. Structural fingerprint (O(1) exact-match dedup)
// 2. 42-dimensional Section Density Vector computation
// 3. Per-vertical dimension weight multipliers
// 4. Weighted cosine similarity dedup
// ═══════════════════════════════════════════════════════════════

import type { NormalizedComposition, CompositionVector } from '../shared/types.js';
import { SECTION_TYPE_INDEX } from '../shared/section-types.js';
import { getSaturation } from '../shared/colors.js';

// ── Vector Computation ──

export function computeVector(comp: NormalizedComposition): CompositionVector {
  const section_presence = new Array(28).fill(0);
  comp.sections.forEach(s => {
    const idx = SECTION_TYPE_INDEX[s.type];
    if (idx !== undefined) section_presence[idx] = 1;
  });

  const n = Math.max(comp.sections.length, 1);

  return {
    section_presence,
    avg_image_ratio: mean(comp.sections.map(s => s.content_hints?.product_count || 0)) / 10,
    avg_text_density: mean(comp.sections.map(s => (s.content_hints?.heading?.length || 0))) / 100,
    button_density: comp.sections.filter(s => s.content_hints?.has_carousel).length / n,
    avg_luminance: mean(comp.sections.map(s => s.is_dark ? 0.2 : 0.8)),
    dark_section_ratio: comp.sections.filter(s => s.is_dark).length / n,
    section_count: Math.min(comp.section_count / 15, 1.0),
    hero_height_ratio: comp.sections.find(s => s.type.startsWith('hero'))?.height_ratio || 0,
    has_carousel: comp.sections.some(s => s.content_hints?.has_carousel) ? 1 : 0,
    has_marquee: comp.sections.some(s => s.type === 'marquee') ? 1 : 0,
    max_grid_columns: Math.min(
      Math.max(...comp.sections.map(s => s.content_hints?.grid_columns || 1), 1) / 4, 1.0
    ),
    is_dark_theme: comp.palette?.is_dark_theme ? 1 : 0,
    gold_proportion: comp.palette?.indian_color_signals?.gold_proportion || 0,
    maroon_proportion: comp.palette?.indian_color_signals?.maroon_proportion || 0,
    accent_saturation: comp.palette?.accent ? getSaturation(comp.palette.accent) : 0.5,
  };
}

export function vectorToArray(v: CompositionVector): number[] {
  return [
    ...v.section_presence,       // 28 dims
    v.avg_image_ratio,           // 1
    v.avg_text_density,          // 1
    v.button_density,            // 1
    v.avg_luminance,             // 1
    v.dark_section_ratio,        // 1
    v.section_count,             // 1
    v.hero_height_ratio,         // 1
    v.has_carousel,              // 1
    v.has_marquee,               // 1
    v.max_grid_columns,          // 1
    v.is_dark_theme,             // 1
    v.gold_proportion,           // 1
    v.maroon_proportion,         // 1
    v.accent_saturation,         // 1
  ];                             // Total: 42 dims
}

// ── Vertical Weight Multipliers ──

const VERTICAL_WEIGHTS: Record<string, number[]> = {
  jewellery: buildWeights({ gold_proportion: 3.0, maroon_proportion: 2.0, is_dark_theme: 2.0, accent_saturation: 2.5 }),
  fashion:   buildWeights({ hero_height_ratio: 2.0, has_carousel: 1.5, avg_image_ratio: 2.0 }),
  food:      buildWeights({ section_count: 1.5, button_density: 2.0, has_carousel: 0.5 }),
  beauty:    buildWeights({ accent_saturation: 2.0, avg_luminance: 1.5, hero_height_ratio: 1.5 }),
  default:   new Array(42).fill(1.0),
};

function buildWeights(overrides: Record<string, number>): number[] {
  const w = new Array(42).fill(1.0);
  const dimMap: Record<string, number> = {
    avg_image_ratio: 28, avg_text_density: 29, button_density: 30,
    avg_luminance: 31, dark_section_ratio: 32, section_count: 33,
    hero_height_ratio: 34, has_carousel: 35, has_marquee: 36, max_grid_columns: 37,
    is_dark_theme: 38, gold_proportion: 39, maroon_proportion: 40, accent_saturation: 41,
  };
  for (const [key, weight] of Object.entries(overrides)) {
    if (dimMap[key] !== undefined) w[dimMap[key]] = weight;
  }
  return w;
}

// ── Similarity Functions ──

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i]; magA += a[i] ** 2; magB += b[i] ** 2;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

export function weightedCosineSimilarity(a: number[], b: number[], vertical: string): number {
  const weights = VERTICAL_WEIGHTS[vertical] || VERTICAL_WEIGHTS['default'];
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const wa = a[i] * weights[i];
    const wb = b[i] * weights[i];
    dot += wa * wb; magA += wa ** 2; magB += wb ** 2;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

// ── Structural Fingerprint (fast O(1) pre-dedup) ──

export function structuralFingerprint(comp: NormalizedComposition): string {
  const typeSequence = comp.sections.map(s => s.type).join('→');
  const rhythm = comp.sections.map(s => s.is_dark ? 'D' : 'L').join('');
  const ctaDensity = Math.round(
    comp.sections.filter(s =>
      ['newsletter', 'collection_banner', 'countdown_timer'].includes(s.type)
    ).length / Math.max(comp.sections.length, 1) * 10
  );
  return `${typeSequence}|${rhythm}|${ctaDensity}`;
}

// ── Deduplication ──

export function deduplicateCompositions(
  compositions: NormalizedComposition[],
  similarityThreshold = 0.92
): NormalizedComposition[] {
  // Phase 1: Structural fingerprint dedup (O(n))
  const fpMap = new Map<string, NormalizedComposition>();
  for (const comp of compositions) {
    const fp = structuralFingerprint(comp);
    const existing = fpMap.get(fp);
    if (!existing || comp.quality_score > existing.quality_score) {
      fpMap.set(fp, comp);
    }
  }
  const afterFP = Array.from(fpMap.values());

  // Phase 2: Weighted vector similarity dedup (O(n²) on reduced set)
  const withVecs = afterFP.map(comp => ({
    comp,
    vec: vectorToArray(computeVector(comp)),
  }));

  const kept: typeof withVecs = [];

  for (const candidate of withVecs) {
    const vertical = candidate.comp.source.vertical || 'default';
    const similarIdx = kept.findIndex(existing =>
      weightedCosineSimilarity(candidate.vec, existing.vec, vertical) > similarityThreshold
    );

    if (similarIdx < 0) {
      kept.push(candidate);
    } else if (candidate.comp.quality_score > kept[similarIdx].comp.quality_score) {
      kept[similarIdx] = candidate;
    }
  }

  return kept.map(k => k.comp);
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
