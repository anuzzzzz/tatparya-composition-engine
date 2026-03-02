// ═══════════════════════════════════════════════════════════════
// Color Utilities
// Conversion functions + Indian market color detectors
// Used by both extractor (browser-side) and normalizer (Node-side)
// ═══════════════════════════════════════════════════════════════

export function rgbToHex(rgb: string): string {
  const match = rgb.match(/\d+/g);
  if (!match) return rgb;
  const [r, g, b] = match.map(Number);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h, s, l };
}

export function isDarkColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

export function isDarkBackground(color: string): boolean {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return false;
  const match = color.match(/\d+/g);
  if (!match || match.length < 3) return false;
  const [r, g, b] = match.map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

export function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ── Indian Market Color Detectors ──

export function isGoldTone(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r > 170 && g > 140 && g < 220 && b < 120 && r > g;
}

export function isMaroonTone(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r > 100 && r < 180 && g < 50 && b < 50;
}

export function isSaffronTone(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r > 200 && g > 100 && g < 180 && b < 80;
}

export function isDeepGreen(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r < 80 && g > 80 && g < 160 && b < 80;
}

// Compute contrast ratio between two hex colors (WCAG formula)
export function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = relativeLuminance(hex1);
  const lum2 = relativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Compute color distance in RGB space (euclidean)
export function colorDistance(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return Math.sqrt(
    Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
  );
}

// Get saturation of a hex color (0-1)
export function getSaturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b).s;
}
