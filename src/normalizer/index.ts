// ═══════════════════════════════════════════════════════════════
// Normalizer — Maps raw extraction to Tatparya vocabulary
//
// Takes a CrawlResult and produces a NormalizedComposition with:
// - Sections mapped to our 28 section types
// - Palette classified into design token roles
// - Typography matched to our 20 font pairings
// - Auto-generated tags
// - Quality-filtered sections (removes low-confidence)
// ═══════════════════════════════════════════════════════════════

import { createHash } from 'crypto';
import type {
  CrawlResult, NormalizedComposition, NormalizedSection, PerceivedPalette,
} from '../shared/types.js';
import { classifyPalette } from './palette-classifier.js';
import { matchTypography } from './font-matcher.js';
import { inferVariant } from './variant-inferrer.js';

export function normalizeExtraction(
  raw: CrawlResult,
  perceivedPalette?: PerceivedPalette
): NormalizedComposition {
  // Use reconciled sections (mobile-prioritized) if available, else desktop
  const rawSections = raw.reconciled_sections.length > 0
    ? raw.reconciled_sections.map((rs, i) => {
        // Find the best raw section data (prefer mobile)
        const mobileSection = raw.mobile.sections.find(s => s.detected_type === rs.type);
        const desktopSection = raw.desktop.sections.find(s => s.detected_type === rs.type);
        const best = mobileSection || desktopSection;
        return {
          type: rs.type,
          confidence: rs.confidence,
          position: i,
          is_dark: rs.is_dark,
          height_ratio: rs.height_ratio_mobile || rs.height_ratio_desktop,
          raw: best,
          reconciled: rs,
        };
      })
    : raw.desktop.sections.map((s, i) => ({
        type: s.detected_type,
        confidence: s.confidence,
        position: i,
        is_dark: s.is_dark,
        height_ratio: s.viewport_ratio,
        raw: s,
        reconciled: null,
      }));

  // 1. Map sections — filter out unknown and low-confidence
  const sections: NormalizedSection[] = rawSections
    .filter(s => s.type !== 'unknown' && s.confidence > 0.4)
    .map((s, i) => ({
      type: s.type,
      detected_variant: s.raw ? inferVariant(s.raw) : undefined,
      confidence: s.confidence,
      position: i,
      is_dark: s.is_dark,
      height_ratio: s.height_ratio,
      content_hints: {
        heading: s.raw?.heading_text || undefined,
        product_count: s.raw && s.raw.has_images > 3 ? s.raw.has_images : undefined,
        has_carousel: s.raw?.has_carousel ?? false,
        grid_columns: s.raw?.grid_columns ?? 1,
      },
    }));

  // 2. Classify palette (merge DOM + pixel)
  const palette = classifyPalette(raw.desktop.palette, perceivedPalette);

  // 3. Match typography
  const typography = matchTypography(raw.desktop.typography);

  // 4. Auto-tag
  const tags = generateTags(sections, palette, raw);

  // 5. Infer vertical
  const vertical = raw.target.vertical || inferVertical(sections, palette, tags);

  return {
    id: generateId(raw.target.url),
    source: {
      url: raw.target.url,
      type: raw.target.source,
      theme_name: raw.target.theme_name,
      vertical,
      sub_vertical: raw.target.sub_vertical,
    },
    sections,
    palette,
    typography,
    quality_score: 0, // filled by quality scorer
    section_count: sections.length,
    dark_section_rhythm: sections.map(s => s.is_dark ? 'D' : 'L').join(''),
    tags,
    crawled_at: raw.metadata.crawled_at,
  };
}

function generateId(url: string): string {
  return 'comp_' + createHash('sha256')
    .update(url + Date.now().toString())
    .digest('hex')
    .substring(0, 8);
}

function generateTags(
  sections: NormalizedSection[],
  palette: any,
  raw: CrawlResult
): string[] {
  const tags: string[] = [];

  // Hero style
  const heroSection = sections.find(s => s.type.startsWith('hero'));
  if (heroSection) {
    if (heroSection.type === 'hero_full_bleed') tags.push('full-bleed-hero');
    if (heroSection.type === 'hero_split') tags.push('split-hero');
    if (heroSection.type === 'hero_slideshow') tags.push('slideshow');
    if (heroSection.type === 'hero_minimal') tags.push('minimal-hero');
    if (heroSection.is_dark) tags.push('dark-hero');
    if (heroSection.height_ratio > 0.8) tags.push('tall-hero');
  }

  // Has sections
  if (sections.some(s => s.type === 'marquee')) tags.push('marquee');
  if (sections.some(s => s.type.includes('carousel') || s.content_hints.has_carousel)) tags.push('carousel');
  if (sections.some(s => s.type === 'video_section')) tags.push('video');
  if (sections.some(s => s.type === 'ugc_gallery')) tags.push('ugc');
  if (sections.some(s => s.type === 'lookbook')) tags.push('lookbook');
  if (sections.some(s => s.type === 'countdown_timer')) tags.push('urgency');

  // Section count vibes
  if (sections.length <= 5) tags.push('minimal');
  if (sections.length >= 10) tags.push('content-rich');

  // Palette vibes
  if (palette.is_dark_theme) tags.push('dark-theme');
  if (palette.indian_color_signals?.has_gold) tags.push('gold-accent');
  if (palette.indian_color_signals?.has_maroon) tags.push('maroon');
  if (palette.indian_color_signals?.has_saffron) tags.push('saffron');

  // Rhythm
  const rhythm = sections.map(s => s.is_dark ? 'D' : 'L').join('');
  const darkSections = (rhythm.match(/D/g) || []).length;
  if (darkSections / sections.length > 0.3) tags.push('dark-sections');

  // Typography vibe (from pairing)
  // Would need pairing data to fully implement
  if (sections.some(s => s.height_ratio > 0.9)) tags.push('editorial');

  return [...new Set(tags)];
}

function inferVertical(
  sections: NormalizedSection[],
  palette: any,
  tags: string[]
): string {
  // Indian color signals strongly suggest vertical
  if (palette.indian_color_signals?.has_gold && palette.indian_color_signals?.gold_proportion > 0.1) {
    return 'jewellery';
  }
  if (palette.indian_color_signals?.has_maroon && palette.indian_color_signals?.maroon_proportion > 0.1) {
    return 'fashion';
  }

  // Content-based inference from headings
  const allHeadings = sections
    .map(s => s.content_hints.heading || '')
    .join(' ')
    .toLowerCase();

  if (allHeadings.match(/jewel|ring|necklace|bracelet|gold|diamond|bridal/)) return 'jewellery';
  if (allHeadings.match(/dress|fashion|wear|cloth|saree|kurta|lehenga/)) return 'fashion';
  if (allHeadings.match(/beauty|skin|makeup|cosmetic|glow|serum/)) return 'beauty';
  if (allHeadings.match(/food|snack|spice|tea|coffee|organic|farm/)) return 'food';
  if (allHeadings.match(/home|decor|furniture|living|kitchen/)) return 'homedecor';
  if (allHeadings.match(/tech|gadget|phone|laptop|electronic/)) return 'electronics';
  if (allHeadings.match(/wellness|health|yoga|ayurved|fitness/)) return 'wellness';

  return 'general';
}

export { classifyPalette } from './palette-classifier.js';
export { matchTypography } from './font-matcher.js';
export { inferVariant } from './variant-inferrer.js';
