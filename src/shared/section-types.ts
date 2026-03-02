// ═══════════════════════════════════════════════════════════════
// Tatparya Section Vocabulary — 28 section types
// The composition engine maps every detected DOM section to one of these.
// ═══════════════════════════════════════════════════════════════

export const SECTION_TYPES = [
  'announcement_bar',
  'hero_full_bleed',
  'hero_split',
  'hero_slideshow',
  'hero_bento',
  'hero_minimal',
  'trust_bar',
  'marquee',
  'logo_bar',
  'testimonial_cards',
  'testimonial_marquee',
  'ugc_gallery',
  'stats_bar',
  'featured_products',
  'product_carousel',
  'featured_product',
  'category_pills',
  'category_grid',
  'collection_banner',
  'lookbook',
  'about_brand',
  'image_with_text',
  'video_section',
  'quote_block',
  'newsletter',
  'countdown_timer',
  'recently_viewed',
  'rich_text',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_TYPE_INDEX: Record<string, number> = {};
SECTION_TYPES.forEach((type, i) => {
  SECTION_TYPE_INDEX[type] = i;
});

// Variant definitions for each section type
export const SECTION_VARIANTS: Record<string, string[]> = {
  hero_full_bleed: ['gradient_texture', 'solid_overlay', 'parallax', 'kenburns'],
  hero_split: ['image_left', 'image_right', 'asymmetric'],
  hero_slideshow: ['fade', 'slide', 'kenburns'],
  hero_bento: ['2x2', '3_panel', 'asymmetric'],
  hero_minimal: ['centered', 'left_aligned'],
  featured_products: ['grid_minimal', 'grid_editorial', 'grid_compact'],
  product_carousel: ['standard', 'full_width', 'peek'],
  testimonial_cards: ['grid', 'carousel', 'masonry'],
  category_grid: ['2col', '3col', '4col', 'asymmetric'],
  image_with_text: ['image_left', 'image_right', 'overlapping'],
};
