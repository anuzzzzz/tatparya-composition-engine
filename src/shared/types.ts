// ═══════════════════════════════════════════════════════════════
// Tatparya Composition Engine — Shared Types
// Every module imports from here. This is the single source of truth.
// ═══════════════════════════════════════════════════════════════

// ── Crawl Targets ──

export interface CrawlTarget {
  url: string;
  source: 'shopify_theme_demo' | 'live_store' | 'curated_d2c';
  vertical?: string;
  sub_vertical?: string;
  theme_name?: string;
  preset_name?: string;
}

export type Viewport = 'mobile' | 'desktop';

export const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
};

// ── Raw Extraction (from page.evaluate) ──

export interface RawSection {
  index: number;
  method: 'shopify' | 'heuristic';
  shopify_id: string | null;
  detected_type: string;
  confidence: number;
  height_px: number;
  width_px: number;
  is_full_width: boolean;
  viewport_ratio: number;
  background_color: string;
  background_image: string | null;
  is_dark: boolean;
  padding_top: number;
  padding_bottom: number;
  has_images: number;
  has_buttons: number;
  heading_text: string | null;
  text_content_length: number;
  grid_columns: number;
  has_carousel: boolean;
  has_video: boolean;
}

export interface RawPalette {
  proportions: { hex: string; proportion: number; area_px: number }[];
  text_colors: { hex: string; frequency: number }[];
  accent_candidates: { hex: string; frequency: number }[];
  css_custom_properties: Record<string, string>;
  indian_color_signals: {
    has_gold: boolean;
    gold_proportion: number;
    has_maroon: boolean;
    maroon_proportion: number;
    has_saffron: boolean;
    has_deep_green: boolean;
  };
  dominant_bg: string;
  is_dark_theme: boolean;
}

export interface RawTypography {
  font_usage: Record<string, {
    heading: boolean;
    body: boolean;
    sizes: number[];
    weights: string[];
  }>;
  google_fonts_loaded: string[];
  heading_font: string | null;
  body_font: string | null;
  base_font_size_px: number | null;
  heading_scale: number | null;
}

export interface RawLayout {
  title: string;
  metaDescription: string;
  total_sections: number;
  totalHeight: number;
  viewport_height: number;
  section_heights: { id: string; height: number; viewport_ratio: number }[];
  dark_light_pattern: string;
  full_width_ratio: number;
}

export interface RawExtraction {
  sections: RawSection[];
  palette: RawPalette;
  typography: RawTypography;
  layout: RawLayout;
}

// ── Viewport Extraction ──

export interface ViewportExtraction {
  viewport: Viewport;
  sections: RawSection[];
  palette: RawPalette;
  typography: RawTypography;
  layout: RawLayout;
  screenshot: Buffer;
}

// ── Reconciled Section ──

export interface ReconciledSection {
  type: string;
  confidence: number;
  on_desktop: boolean;
  on_mobile: boolean;
  required: boolean;
  mobile_variant_hint?: string;
  desktop_variant_hint?: string;
  is_dark: boolean;
  height_ratio_mobile: number;
  height_ratio_desktop: number;
  is_primary_hero_candidate?: boolean;
  mobile_prominence_score?: number;
  responsive_variant?: {
    desktop_layout: { grid_columns: number; has_carousel: boolean; height_ratio: number };
    mobile_layout: { grid_columns: number; has_carousel: boolean; height_ratio: number };
  } | null;
}

// ── Crawl Result ──

export interface CrawlResult {
  target: CrawlTarget;
  desktop: ViewportExtraction;
  mobile: ViewportExtraction;
  reconciled_sections: ReconciledSection[];
  metadata: {
    title: string;
    description: string;
    crawled_at: string;
    load_time_ms: number;
    total_height_desktop_px: number;
    total_height_mobile_px: number;
    skip_reason?: string;
    iframe_builder?: string;
    iframe_src?: string;
  };
}

// ── Perceived Palette (from pixel clustering) ──

export interface PerceivedPalette {
  perceived_colors: {
    hex: string;
    proportion: number;
    r: number;
    g: number;
    b: number;
  }[];
  is_dark_perceived: boolean;
}

// ── Normalized Composition ──

export interface NormalizedSection {
  type: string;
  detected_variant?: string;
  confidence: number;
  position: number;
  is_dark: boolean;
  height_ratio: number;
  content_hints: {
    heading?: string;
    product_count?: number;
    has_carousel: boolean;
    grid_columns: number;
  };
}

export interface NormalizedPalette {
  background: string;
  surface: string;
  text_primary: string;
  text_secondary: string;
  accent: string;
  dark_bg?: string;
  is_dark_theme: boolean;
  proportions?: { hex: string; proportion: number; role: string }[];
  indian_color_signals?: {
    has_gold: boolean;
    gold_proportion: number;
    has_maroon: boolean;
    maroon_proportion: number;
    has_saffron: boolean;
    has_deep_green: boolean;
  };
}

export interface NormalizedTypography {
  heading_font: string;
  body_font: string;
  closest_pairing_id?: string;
}

export interface NormalizedComposition {
  id: string;
  source: {
    url: string;
    type: 'shopify_theme_demo' | 'live_store' | 'curated_d2c';
    theme_name?: string;
    vertical?: string;
    sub_vertical?: string;
  };
  sections: NormalizedSection[];
  palette: NormalizedPalette;
  typography: NormalizedTypography;
  quality_score: number;
  effective_score?: number;
  section_count: number;
  dark_section_rhythm: string;
  tags: string[];
  crawled_at?: string;
}

// ── Vision Validation ──

export interface VisionValidationResult {
  agrees_with_dom: boolean;
  detected_sections: string[];
  detected_vibe: string[];
  detected_vertical: string;
  disagreements: {
    position: number;
    dom_said: string;
    vision_says: string;
  }[];
  confidence_boost: number;
  flagged_for_review: boolean;
}

// ── Composition Vector ──

export interface CompositionVector {
  section_presence: number[];
  avg_image_ratio: number;
  avg_text_density: number;
  button_density: number;
  avg_luminance: number;
  dark_section_ratio: number;
  section_count: number;
  hero_height_ratio: number;
  has_carousel: number;
  has_marquee: number;
  max_grid_columns: number;
  is_dark_theme: number;
  gold_proportion: number;
  maroon_proportion: number;
  accent_saturation: number;
}

// ── Archetype ──

export interface Archetype {
  id: string;
  name: string;
  vertical: string;
  cluster_size: number;
  confidence: number;
  representative_source: string;
  section_pattern: {
    type: string;
    variant?: string;
    required: boolean;
    background_hint: 'light' | 'dark';
    position: number;
  }[];
  palette_centroid: {
    avg_gold_proportion: number;
    avg_maroon_proportion: number;
    dark_theme_ratio: number;
  };
  tags: string[];
  quality_score: number;
  vector: number[];
  member_ids: string[];
}

// ── Composition Template ──

export interface CompositionTemplate {
  id: string;
  name: string;
  source_url: string;
  source_type: string;
  vertical: string;
  sub_vertical?: string;
  tags: string[];
  quality_score: number;
  effective_score: number;
  crawled_at: string;
  archetype_id?: string;
  sections: {
    type: string;
    variant?: string;
    required: boolean;
    background_hint: 'light' | 'dark' | 'surface';
    position: number;
    is_primary_hero_candidate?: boolean;
    responsive_variant?: ReconciledSection['responsive_variant'];
  }[];
  palette_hint?: {
    background: string;
    surface: string;
    accent: string;
    proportions?: { hex: string; proportion: number; role: string }[];
    indian_signals?: NormalizedPalette['indian_color_signals'];
  };
  typography_hint?: {
    heading_font: string;
    body_font: string;
  };
}

// ── Final Library ──

export interface CompositionLibrary {
  version: string;
  generated_at: string;
  stats: {
    total_stores_crawled: number;
    total_compositions: number;
    compositions_after_dedup: number;
    compositions_after_quality_filter: number;
    total_archetypes: number;
    by_vertical: Record<string, number>;
    by_source: Record<string, number>;
  };
  archetypes: Record<string, Archetype[]>;
  compositions: CompositionTemplate[];
}

// ── Seller Context (for selectCompositions) ──

export interface SellerContext {
  vertical: string;
  product_price_range: 'budget' | 'mid' | 'premium' | 'luxury';
  brand_vibe: string[];
  product_count: number;
  has_reviews: boolean;
  has_video: boolean;
  has_multiple_categories: boolean;
}
