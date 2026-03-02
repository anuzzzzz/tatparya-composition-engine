// ═══════════════════════════════════════════════════════════════
// Variant Inferrer
// Maps raw section data to specific variant identifiers
// (e.g., hero_full_bleed → "gradient_texture" or "solid_overlay")
// ═══════════════════════════════════════════════════════════════

import type { RawSection } from '../shared/types.js';

export function inferVariant(section: RawSection): string | undefined {
  const type = section.detected_type;

  switch (type) {
    case 'hero_full_bleed':
      if (section.background_image) return 'gradient_texture';
      return 'solid_overlay';

    case 'hero_split':
      if (section.grid_columns === 2) {
        return section.has_images > 0 ? 'image_right' : 'image_left';
      }
      return 'asymmetric';

    case 'hero_slideshow':
      return 'slide';

    case 'hero_bento':
      if (section.has_images >= 4) return 'asymmetric';
      if (section.grid_columns >= 2) return '2x2';
      return '3_panel';

    case 'hero_minimal':
      return section.grid_columns >= 2 ? 'left_aligned' : 'centered';

    case 'featured_products':
      if (section.grid_columns >= 4) return 'grid_editorial';
      if (section.grid_columns <= 2) return 'grid_minimal';
      return 'grid_compact';

    case 'product_carousel':
      if (section.is_full_width) return 'full_width';
      return 'standard';

    case 'testimonial_cards':
      if (section.has_carousel) return 'carousel';
      if (section.grid_columns >= 3) return 'masonry';
      return 'grid';

    case 'category_grid':
      if (section.grid_columns >= 4) return '4col';
      if (section.grid_columns === 3) return '3col';
      return '2col';

    case 'image_with_text':
      return section.grid_columns >= 2 ? 'image_left' : 'overlapping';

    default:
      return undefined;
  }
}
