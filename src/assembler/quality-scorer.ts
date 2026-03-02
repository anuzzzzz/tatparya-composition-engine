// ═══════════════════════════════════════════════════════════════
// Quality Scorer — Conversion-Aware
// Scores composition architecture, not just structure.
// High-converting Indian D2C stores have specific patterns:
// hero at top, product grid early, trust before testimonials,
// balanced CTA density, visual rhythm (light/dark alternation).
// ═══════════════════════════════════════════════════════════════

import type { NormalizedSection, NormalizedComposition, CrawlResult, VisionValidationResult } from '../shared/types.js';

export function scoreQualityHeuristic(
  sections: NormalizedSection[],
  raw?: CrawlResult
): number {
  let score = 50;

  // ═══ STRUCTURAL SIGNALS (max +30) ═══
  if (sections.length >= 5 && sections.length <= 15) score += 10;
  else if (sections.length >= 3) score += 3;
  else score -= 20;

  const avgConfidence = sections.length > 0
    ? sections.reduce((a, s) => a + s.confidence, 0) / sections.length : 0;
  score += avgConfidence * 10;

  const uniqueTypes = new Set(sections.map(s => s.type)).size;
  score += Math.min(uniqueTypes / Math.max(sections.length, 1) * 10, 10);

  // ═══ CONVERSION SEQUENCE SIGNALS (max +35) ═══

  // 1. Hero position weight
  const heroIdx = sections.findIndex(s => s.type.startsWith('hero'));
  if (heroIdx === 0 || heroIdx === 1) score += 10;
  else if (heroIdx === 2) score += 3;
  else if (heroIdx < 0) score -= 10;

  // 2. Product grid early
  const productIdx = sections.findIndex(s =>
    ['featured_products', 'product_carousel', 'featured_product'].includes(s.type)
  );
  if (productIdx >= 0 && productIdx <= Math.ceil(sections.length / 2)) score += 8;
  else if (productIdx >= 0) score += 2;

  // 3. Trust before testimonials
  const trustIdx = sections.findIndex(s => s.type === 'trust_bar');
  const testimonialIdx = sections.findIndex(s => s.type.includes('testimonial'));
  if (trustIdx >= 0 && testimonialIdx >= 0 && trustIdx < testimonialIdx) score += 5;
  else if (trustIdx >= 0) score += 2;

  // 4. CTA density balance
  const ctaSections = sections.filter(s =>
    ['newsletter', 'collection_banner', 'countdown_timer',
     'hero_full_bleed', 'hero_split', 'hero_slideshow', 'featured_products'].includes(s.type)
  ).length;
  const ctaRatio = ctaSections / Math.max(sections.length, 1);
  if (ctaRatio >= 0.2 && ctaRatio <= 0.5) score += 7;
  else if (ctaRatio > 0) score += 3;

  // 5. Visual rhythm (light/dark alternation)
  const rhythm = sections.map(s => s.is_dark ? 'D' : 'L').join('');
  const transitions = (rhythm.match(/LD|DL/g) || []).length;
  if (transitions >= 2) score += 5;
  else if (transitions >= 1) score += 2;

  // ═══ SCROLL DEPTH DISTRIBUTION (max +10) ═══
  if (sections.length >= 4) {
    const totalHeight = sections.reduce((a, s) => a + (s.height_ratio || 0), 0);
    if (totalHeight > 0) {
      const topHalfHeight = sections.slice(0, Math.ceil(sections.length / 2))
        .reduce((a, s) => a + (s.height_ratio || 0), 0);
      const distribution = topHalfHeight / totalHeight;
      if (distribution >= 0.35 && distribution <= 0.7) score += 10;
      else if (distribution >= 0.25 && distribution <= 0.8) score += 5;
    }
  }

  // ═══ MOBILE PRESENCE BONUS (max +10) ═══
  if (raw?.reconciled_sections) {
    const mobileRatio = raw.reconciled_sections.filter(s => s.on_mobile).length
      / Math.max(raw.reconciled_sections.length, 1);
    score += mobileRatio * 10;

    const primaryHero = raw.reconciled_sections.find(s => s.is_primary_hero_candidate);
    if (primaryHero && primaryHero.type.startsWith('hero')) score += 3;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreQuality(
  sections: NormalizedSection[],
  raw?: CrawlResult,
  visionResult?: VisionValidationResult
): number {
  let score = scoreQualityHeuristic(sections, raw);
  if (visionResult) {
    score += visionResult.confidence_boost;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
