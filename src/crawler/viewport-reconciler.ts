// ═══════════════════════════════════════════════════════════════
// Viewport Reconciler
// Merges desktop + mobile extractions into a single section list.
// Mobile is the source of truth for "required" — if a section is
// hidden on mobile, Indian buyers won't see it.
//
// FIX v2: Matches sections by position proximity + type similarity
//         instead of just type, preventing duplicate-type confusion.
// ═══════════════════════════════════════════════════════════════

import type { ViewportExtraction, ReconciledSection, RawSection } from '../shared/types.js';

export function reconcileViewports(
  desktop: ViewportExtraction,
  mobile: ViewportExtraction
): ReconciledSection[] {
  const reconciled: ReconciledSection[] = [];

  // Track which mobile sections have been claimed
  const claimedMobile = new Set<number>();

  // ── Visual Prominence Scoring ──
  let primaryHeroCandidateIdx = -1;
  let maxProminence = 0;

  mobile.sections.forEach((s, idx) => {
    const positionDecay = 1 / (1 + idx * 0.5);
    const prominence = (s.viewport_ratio || 0) * positionDecay;
    if (prominence > maxProminence) {
      maxProminence = prominence;
      primaryHeroCandidateIdx = idx;
    }
  });

  // Normalize positions to 0-1 range for matching
  const dTotal = Math.max(desktop.sections.length, 1);
  const mTotal = Math.max(mobile.sections.length, 1);

  // Walk through desktop sections in order
  for (let di = 0; di < desktop.sections.length; di++) {
    const dSection = desktop.sections[di];
    const dNormPos = di / dTotal;

    // Find the best matching mobile section:
    // 1. Same type + closest position (best match)
    // 2. Same type anywhere (fallback)
    // 3. No match (desktop-only)
    let bestMobileIdx = -1;
    let bestScore = -1;

    for (let mi = 0; mi < mobile.sections.length; mi++) {
      if (claimedMobile.has(mi)) continue;
      const mSection = mobile.sections[mi];

      // Type must match for pairing
      if (mSection.detected_type !== dSection.detected_type) continue;

      // Score: closer position = better match
      const mNormPos = mi / mTotal;
      const posDist = Math.abs(dNormPos - mNormPos);
      const score = 1 - posDist; // 1.0 = same relative position, 0.0 = opposite ends

      if (score > bestScore) {
        bestScore = score;
        bestMobileIdx = mi;
      }
    }

    const mSection = bestMobileIdx >= 0 ? mobile.sections[bestMobileIdx] : null;
    if (bestMobileIdx >= 0) claimedMobile.add(bestMobileIdx);

    // ── Responsive Variant Detection ──
    let responsiveVariant: ReconciledSection['responsive_variant'] = null;
    if (mSection && dSection) {
      const layoutDiffers = (
        dSection.grid_columns !== (mSection.grid_columns || dSection.grid_columns) ||
        dSection.has_carousel !== (mSection.has_carousel || dSection.has_carousel) ||
        Math.abs((dSection.viewport_ratio || 0) - (mSection.viewport_ratio || 0)) > 0.3
      );
      if (layoutDiffers) {
        responsiveVariant = {
          desktop_layout: {
            grid_columns: dSection.grid_columns,
            has_carousel: dSection.has_carousel,
            height_ratio: dSection.viewport_ratio,
          },
          mobile_layout: {
            grid_columns: mSection.grid_columns,
            has_carousel: mSection.has_carousel,
            height_ratio: mSection.viewport_ratio,
          },
        };
      }
    }

    // ── Visual Prominence Tagging ──
    const isPrimaryHeroCandidate =
      bestMobileIdx === primaryHeroCandidateIdx && maxProminence > 0.4;

    reconciled.push({
      type: dSection.detected_type,
      confidence: Math.max(dSection.confidence, mSection?.confidence || 0),
      on_desktop: true,
      on_mobile: !!mSection,
      required: !!mSection && Math.max(dSection.confidence, mSection?.confidence || 0) > 0.7,
      desktop_variant_hint: inferVariantFromRaw(dSection),
      mobile_variant_hint: mSection ? inferVariantFromRaw(mSection) : undefined,
      is_dark: dSection.is_dark || (mSection?.is_dark ?? false),
      height_ratio_desktop: dSection.viewport_ratio,
      height_ratio_mobile: mSection?.viewport_ratio || 0,
      is_primary_hero_candidate: isPrimaryHeroCandidate,
      mobile_prominence_score: mSection
        ? (mSection.viewport_ratio || 0) * (1 / (1 + bestMobileIdx * 0.5))
        : 0,
      responsive_variant: responsiveVariant,
    });
  }

  // Add any unclaimed mobile-only sections
  for (let mi = 0; mi < mobile.sections.length; mi++) {
    if (claimedMobile.has(mi)) continue;

    const mSection = mobile.sections[mi];
    reconciled.push({
      type: mSection.detected_type,
      confidence: mSection.confidence,
      on_desktop: false,
      on_mobile: true,
      required: mSection.confidence > 0.7,
      desktop_variant_hint: undefined,
      mobile_variant_hint: inferVariantFromRaw(mSection),
      is_dark: mSection.is_dark,
      height_ratio_desktop: 0,
      height_ratio_mobile: mSection.viewport_ratio,
      is_primary_hero_candidate:
        mi === primaryHeroCandidateIdx && maxProminence > 0.4,
      mobile_prominence_score:
        (mSection.viewport_ratio || 0) * (1 / (1 + mi * 0.5)),
      responsive_variant: null,
    });
  }

  return reconciled;
}

// Infer a variant hint from raw section properties
function inferVariantFromRaw(section: RawSection): string | undefined {
  const type = section.detected_type;

  if (type === 'hero_full_bleed' && section.background_image) return 'gradient_texture';
  if (type === 'hero_full_bleed' && !section.background_image) return 'solid_overlay';
  if (type === 'hero_split' && section.grid_columns === 2) return 'image_right';
  if (type === 'hero_slideshow' && section.has_carousel) return 'slide';
  if (type === 'featured_products' && section.grid_columns >= 4) return 'grid_editorial';
  if (type === 'featured_products' && section.grid_columns <= 2) return 'grid_minimal';
  if (type === 'product_carousel' && section.has_carousel) return 'standard';
  if (type === 'testimonial_cards' && section.has_carousel) return 'carousel';
  if (type === 'testimonial_cards' && !section.has_carousel) return 'grid';
  if (type === 'category_grid' && section.grid_columns >= 4) return '4col';
  if (type === 'category_grid' && section.grid_columns === 3) return '3col';
  if (type === 'category_grid' && section.grid_columns <= 2) return '2col';
  if (type === 'image_with_text' && section.grid_columns === 2) return 'image_left';

  return undefined;
}
