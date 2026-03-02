// ═══════════════════════════════════════════════════════════════
// Viewport Reconciler
// Merges desktop + mobile extractions into a single section list.
// Mobile is the source of truth for "required" — if a section is
// hidden on mobile, Indian buyers won't see it.
//
// Features:
// - Visual Prominence Scoring (mobile fold is king)
// - Responsive Variant Detection (desktop grid → mobile carousel)
// - Primary Hero Candidate tagging
// ═══════════════════════════════════════════════════════════════

import type { ViewportExtraction, ReconciledSection, RawSection } from '../shared/types.js';

export function reconcileViewports(
  desktop: ViewportExtraction,
  mobile: ViewportExtraction
): ReconciledSection[] {
  const reconciled: ReconciledSection[] = [];

  const mobileSectionTypes = new Set(mobile.sections.map(s => s.detected_type));
  const desktopSectionTypes = new Set(desktop.sections.map(s => s.detected_type));

  // ── Visual Prominence Scoring ──
  // Calculate which mobile section dominates the fold.
  // Score = viewport_ratio × position_decay (earlier = more prominent)
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

  // Walk through desktop sections in order
  let mobileIdx = 0;
  for (const dSection of desktop.sections) {
    const onMobile = mobileSectionTypes.has(dSection.detected_type);

    // Find the corresponding mobile section
    const mSection = mobile.sections.find(
      (s, i) => s.detected_type === dSection.detected_type && i >= mobileIdx
    );

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
    const mSectionIdx = mSection ? mobile.sections.indexOf(mSection) : -1;
    const isPrimaryHeroCandidate =
      mSectionIdx === primaryHeroCandidateIdx && maxProminence > 0.4;

    reconciled.push({
      type: dSection.detected_type,
      confidence: Math.max(dSection.confidence, mSection?.confidence || 0),
      on_desktop: true,
      on_mobile: onMobile,
      required: onMobile && Math.max(dSection.confidence, mSection?.confidence || 0) > 0.7,
      desktop_variant_hint: inferVariantFromRaw(dSection),
      mobile_variant_hint: mSection ? inferVariantFromRaw(mSection) : undefined,
      is_dark: dSection.is_dark || (mSection?.is_dark ?? false),
      height_ratio_desktop: dSection.viewport_ratio,
      height_ratio_mobile: mSection?.viewport_ratio || 0,
      is_primary_hero_candidate: isPrimaryHeroCandidate,
      mobile_prominence_score: mSection
        ? (mSection.viewport_ratio || 0) * (1 / (1 + mSectionIdx * 0.5))
        : 0,
      responsive_variant: responsiveVariant,
    });
  }

  // Add any mobile-only sections
  for (const mSection of mobile.sections) {
    if (!desktopSectionTypes.has(mSection.detected_type)) {
      const mSectionIdx = mobile.sections.indexOf(mSection);
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
          mSectionIdx === primaryHeroCandidateIdx && maxProminence > 0.4,
        mobile_prominence_score:
          (mSection.viewport_ratio || 0) * (1 / (1 + mSectionIdx * 0.5)),
        responsive_variant: null,
      });
    }
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
