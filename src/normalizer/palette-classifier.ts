// ═══════════════════════════════════════════════════════════════
// Palette Classifier
// Maps raw color proportions to design token roles:
//   background, surface, text_primary, text_secondary, accent, dark_bg
//
// Merges DOM palette with pixel clustering results:
// - DOM provides structured role assignment
// - Pixel clustering provides ground truth proportions
// - Pixel clustering wins for is_dark_theme determination
// ═══════════════════════════════════════════════════════════════

import type { RawPalette, NormalizedPalette, PerceivedPalette } from '../shared/types.js';
import { isDarkColor, getLuminance, colorDistance, getSaturation } from '../shared/colors.js';

export function classifyPalette(
  domPalette: RawPalette,
  perceivedPalette?: PerceivedPalette
): NormalizedPalette {
  const proportions = domPalette.proportions;
  const textColors = domPalette.text_colors;
  const accentCandidates = domPalette.accent_candidates;

  // ── Determine dark theme ──
  // Pixel clustering wins for dark theme detection (DOM misses gradients, bg images)
  let isDarkTheme = domPalette.is_dark_theme;
  if (perceivedPalette) {
    isDarkTheme = perceivedPalette.is_dark_perceived;
  }

  // ── Assign background (most dominant non-text color) ──
  const background = proportions[0]?.hex || '#FFFFFF';

  // ── Assign surface (second most dominant, similar luminance to background) ──
  const bgLum = getLuminance(background);
  const surfaceCandidates = proportions.slice(1).filter(p => {
    const lumDiff = Math.abs(getLuminance(p.hex) - bgLum);
    return lumDiff < 0.3 && colorDistance(p.hex, background) > 20;
  });
  const surface = surfaceCandidates[0]?.hex || shiftLuminance(background, isDarkTheme ? 0.05 : -0.05);

  // ── Assign text colors ──
  const textPrimary = textColors[0]?.hex || (isDarkTheme ? '#FFFFFF' : '#1A1A1A');
  const textSecondary = textColors.length > 1
    ? textColors.find(t => colorDistance(t.hex, textPrimary) > 30)?.hex
      || shiftLuminance(textPrimary, isDarkTheme ? -0.2 : 0.2)
    : shiftLuminance(textPrimary, isDarkTheme ? -0.2 : 0.2);

  // ── Assign accent (highest saturation among accent candidates) ──
  let accent = '#C5A455'; // default gold for Indian market
  if (accentCandidates.length > 0) {
    const sorted = accentCandidates
      .map(c => ({ hex: c.hex, sat: getSaturation(c.hex) }))
      .sort((a, b) => b.sat - a.sat);
    accent = sorted[0].hex;
  } else {
    // Fallback: find the most saturated color in proportions (not bg, not text)
    const saturated = proportions
      .filter(p => p.hex !== background && colorDistance(p.hex, background) > 40)
      .map(p => ({ hex: p.hex, sat: getSaturation(p.hex) }))
      .sort((a, b) => b.sat - a.sat);
    if (saturated.length > 0 && saturated[0].sat > 0.2) {
      accent = saturated[0].hex;
    }
  }

  // ── Assign dark section background ──
  const darkBg = proportions.find(p => isDarkColor(p.hex) && p.hex !== background)?.hex
    || (isDarkTheme ? '#000000' : '#1A1A1A');

  // ── Build proportions with roles ──
  const roleProportions = proportions.slice(0, 8).map(p => ({
    hex: p.hex,
    proportion: p.proportion,
    role: assignRole(p.hex, background, surface, accent, textPrimary, darkBg),
  }));

  // ── Validate Indian color signals against pixel clustering ──
  let indianSignals = domPalette.indian_color_signals;
  if (perceivedPalette) {
    // If DOM says gold but pixel clustering doesn't see it, reduce confidence
    const perceivedHasGold = perceivedPalette.perceived_colors.some(c => {
      const [r, g, b] = [c.r, c.g, c.b];
      return r > 170 && g > 140 && g < 220 && b < 120 && r > g && c.proportion > 0.02;
    });
    if (indianSignals.has_gold && !perceivedHasGold) {
      indianSignals = { ...indianSignals, has_gold: false, gold_proportion: indianSignals.gold_proportion * 0.3 };
    }
  }

  return {
    background,
    surface,
    text_primary: textPrimary,
    text_secondary: textSecondary,
    accent,
    dark_bg: darkBg,
    is_dark_theme: isDarkTheme,
    proportions: roleProportions,
    indian_color_signals: indianSignals,
  };
}

function assignRole(
  hex: string,
  background: string,
  surface: string,
  accent: string,
  textPrimary: string,
  darkBg: string
): string {
  if (hex === background) return 'background';
  if (hex === surface) return 'surface';
  if (hex === accent) return 'accent';
  if (hex === textPrimary) return 'text';
  if (hex === darkBg) return 'dark_sections';
  if (isDarkColor(hex)) return 'dark_element';
  return 'decorative';
}

function shiftLuminance(hex: string, amount: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return hex;
  const [r, g, b] = [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
  const shift = Math.round(amount * 255);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + shift));
  return '#' + [clamp(r), clamp(g), clamp(b)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}
