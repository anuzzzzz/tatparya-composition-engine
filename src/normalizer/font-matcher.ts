// ═══════════════════════════════════════════════════════════════
// Font Matcher
// Maps extracted fonts to the closest of our 20 curated pairings.
// Uses Levenshtein-like fuzzy matching + Google Fonts detection.
// ═══════════════════════════════════════════════════════════════

import type { RawTypography, NormalizedTypography } from '../shared/types.js';
import { FONT_PAIRINGS, FONT_ALIASES, type FontPairing } from '../shared/font-pairings.js';

export function matchTypography(raw: RawTypography): NormalizedTypography {
  // 1. Identify heading font
  let headingFont = 'Inter';
  let bodyFont = 'Inter';

  const entries = Object.entries(raw.font_usage);

  // Find the most-used heading font
  const headingEntries = entries
    .filter(([_, v]) => v.heading)
    .sort((a, b) => b[1].sizes.length - a[1].sizes.length);

  if (headingEntries.length > 0) {
    headingFont = resolveFont(headingEntries[0][0], raw.google_fonts_loaded);
  }

  // Find the most-used body font
  const bodyEntries = entries
    .filter(([_, v]) => v.body)
    .sort((a, b) => b[1].sizes.length - a[1].sizes.length);

  if (bodyEntries.length > 0) {
    bodyFont = resolveFont(bodyEntries[0][0], raw.google_fonts_loaded);
  }

  // 2. Find closest pairing
  const closestPairing = findClosestPairing(headingFont, bodyFont);

  return {
    heading_font: headingFont,
    body_font: bodyFont,
    closest_pairing_id: closestPairing?.id,
  };
}

function resolveFont(fontName: string, googleFonts: string[]): string {
  const cleaned = fontName.trim().replace(/['"]/g, '');

  // Check aliases first (system fonts → Google Font equivalents)
  if (FONT_ALIASES[cleaned]) return FONT_ALIASES[cleaned];

  // Check if it's in the loaded Google Fonts
  const googleMatch = googleFonts.find(
    gf => gf.toLowerCase() === cleaned.toLowerCase()
  );
  if (googleMatch) return googleMatch;

  // Check if it matches any of our pairing fonts
  const allPairingFonts = FONT_PAIRINGS.flatMap(p => [p.heading, p.body]);
  const directMatch = allPairingFonts.find(
    f => f.toLowerCase() === cleaned.toLowerCase()
  );
  if (directMatch) return directMatch;

  // Fuzzy match against pairing fonts
  const fuzzy = allPairingFonts
    .map(f => ({ font: f, distance: levenshtein(f.toLowerCase(), cleaned.toLowerCase()) }))
    .sort((a, b) => a.distance - b.distance);

  if (fuzzy[0] && fuzzy[0].distance <= 3) return fuzzy[0].font;

  // Fallback: return as-is (might be a valid Google Font we don't have in pairings)
  return cleaned || 'Inter';
}

function findClosestPairing(heading: string, body: string): FontPairing | undefined {
  // Exact match
  const exact = FONT_PAIRINGS.find(
    p => p.heading.toLowerCase() === heading.toLowerCase() &&
         p.body.toLowerCase() === body.toLowerCase()
  );
  if (exact) return exact;

  // Heading match
  const headingMatch = FONT_PAIRINGS.find(
    p => p.heading.toLowerCase() === heading.toLowerCase()
  );
  if (headingMatch) return headingMatch;

  // Body match
  const bodyMatch = FONT_PAIRINGS.find(
    p => p.body.toLowerCase() === body.toLowerCase()
  );
  if (bodyMatch) return bodyMatch;

  // Fuzzy: find pairing with minimum combined distance
  return FONT_PAIRINGS
    .map(p => ({
      pairing: p,
      distance:
        levenshtein(p.heading.toLowerCase(), heading.toLowerCase()) +
        levenshtein(p.body.toLowerCase(), body.toLowerCase()),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.pairing;
}

// Simple Levenshtein distance
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}
