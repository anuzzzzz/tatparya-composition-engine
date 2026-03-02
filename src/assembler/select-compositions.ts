// ═══════════════════════════════════════════════════════════════
// Select Compositions — Integration with Tatparya Store Builder
// Uses archetypes as primary matching source (8-15 per vertical).
// Builds a target vector from seller context, finds best matches
// using weighted cosine similarity with diversity filtering.
// ═══════════════════════════════════════════════════════════════

import type { SellerContext, Archetype, CompositionLibrary } from '../shared/types.js';
import { weightedCosineSimilarity } from './vector-dedup.js';

export function selectCompositions(
  library: CompositionLibrary,
  context: SellerContext,
  count = 3
): Archetype[] {
  const verticalArchetypes = library.archetypes[context.vertical] || [];
  const generalArchetypes = library.archetypes['general'] || [];
  const candidates = [...verticalArchetypes, ...generalArchetypes];

  const targetVector = buildTargetVector(context);

  const scored = candidates.map(arch => {
    let relevance = 0;

    // Vertical match
    if (arch.vertical === context.vertical) relevance += 40;
    if (arch.vertical === 'general') relevance += 5;

    // Tag overlap
    const tagOverlap = arch.tags.filter(t =>
      context.brand_vibe.some(v => t.includes(v) || v.includes(t))
    ).length;
    relevance += tagOverlap * 12;

    // Vector similarity
    if (arch.vector && targetVector) {
      const similarity = weightedCosineSimilarity(arch.vector, targetVector, context.vertical);
      relevance += similarity * 30;
    }

    // Cluster confidence
    relevance += Math.min(arch.cluster_size, 50) * 0.3;

    // Quality
    relevance += arch.quality_score * 0.15;

    // Indian market palette match
    if (context.brand_vibe.some(v => ['traditional', 'ethnic'].includes(v))) {
      if (arch.palette_centroid?.avg_gold_proportion > 0.05) relevance += 8;
      if (arch.palette_centroid?.avg_maroon_proportion > 0.05) relevance += 8;
    }
    if (context.brand_vibe.some(v => ['minimal', 'modern'].includes(v))) {
      if ((arch.palette_centroid?.avg_gold_proportion || 0) > 0.1) relevance -= 5;
    }

    // Content feasibility penalties
    if (arch.section_pattern.some(s => s.type.includes('testimonial')) && !context.has_reviews) relevance -= 10;
    if (arch.section_pattern.some(s => s.type === 'video_section') && !context.has_video) relevance -= 10;
    if (arch.section_pattern.some(s => s.type.includes('category')) && !context.has_multiple_categories) relevance -= 5;

    return { archetype: arch, relevance };
  });

  scored.sort((a, b) => b.relevance - a.relevance);

  // Diversity filter
  const selected: Archetype[] = [];
  for (const { archetype } of scored) {
    if (!archetype.vector) { selected.push(archetype); if (selected.length >= count) break; continue; }
    const tooSimilar = selected.some(ex =>
      ex.vector && weightedCosineSimilarity(archetype.vector, ex.vector, context.vertical) > 0.85
    );
    if (!tooSimilar) selected.push(archetype);
    if (selected.length >= count) break;
  }

  return selected;
}

function buildTargetVector(context: SellerContext): number[] {
  const vec = new Array(42).fill(0);
  vec[1] = 1; // hero
  vec[13] = 1; // featured_products
  vec[24] = 1; // newsletter

  if (context.has_multiple_categories) { vec[16] = 1; vec[17] = 1; }
  if (context.has_reviews) { vec[9] = 1; }
  if (context.has_video) { vec[22] = 1; }
  if (context.product_price_range === 'luxury' || context.product_price_range === 'premium') {
    vec[7] = 1; vec[8] = 1; vec[18] = 1;
  }

  vec[33] = Math.min(context.product_count / 15, 1.0);
  vec[34] = context.product_price_range === 'luxury' ? 0.9 : 0.6;

  const isTraditional = context.brand_vibe.some(v =>
    ['traditional', 'ethnic', 'festive', 'bridal'].includes(v)
  );
  vec[39] = isTraditional ? 0.3 : 0;
  vec[40] = isTraditional ? 0.2 : 0;

  return vec;
}
