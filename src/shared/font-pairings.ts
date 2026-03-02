// ═══════════════════════════════════════════════════════════════
// Tatparya Font Pairings — 20 curated heading + body combos
// The normalizer matches extracted fonts to the closest pairing.
// ═══════════════════════════════════════════════════════════════

export interface FontPairing {
  id: string;
  heading: string;
  body: string;
  vibe: string[];
  verticals: string[];
}

export const FONT_PAIRINGS: FontPairing[] = [
  // Luxury / Editorial
  { id: 'fp_01', heading: 'Playfair Display', body: 'Source Sans Pro', vibe: ['luxury', 'editorial'], verticals: ['fashion', 'jewellery'] },
  { id: 'fp_02', heading: 'Cormorant Garamond', body: 'Proza Libre', vibe: ['elegant', 'traditional'], verticals: ['jewellery', 'fashion'] },
  { id: 'fp_03', heading: 'Libre Baskerville', body: 'Open Sans', vibe: ['classic', 'trustworthy'], verticals: ['general', 'homedecor'] },
  
  // Modern / Clean
  { id: 'fp_04', heading: 'Montserrat', body: 'Open Sans', vibe: ['modern', 'clean'], verticals: ['general', 'electronics'] },
  { id: 'fp_05', heading: 'Poppins', body: 'Inter', vibe: ['modern', 'friendly'], verticals: ['general', 'beauty', 'wellness'] },
  { id: 'fp_06', heading: 'DM Sans', body: 'Inter', vibe: ['minimal', 'tech'], verticals: ['electronics', 'general'] },
  { id: 'fp_07', heading: 'Space Grotesk', body: 'DM Sans', vibe: ['bold', 'contemporary'], verticals: ['fashion', 'electronics'] },
  
  // Warm / Organic
  { id: 'fp_08', heading: 'Fraunces', body: 'Commissioner', vibe: ['warm', 'artisanal'], verticals: ['food', 'wellness'] },
  { id: 'fp_09', heading: 'Lora', body: 'Nunito Sans', vibe: ['warm', 'approachable'], verticals: ['food', 'beauty'] },
  { id: 'fp_10', heading: 'Merriweather', body: 'Lato', vibe: ['readable', 'warm'], verticals: ['general', 'food'] },
  
  // Bold / Statement
  { id: 'fp_11', heading: 'Oswald', body: 'Roboto', vibe: ['bold', 'impact'], verticals: ['fashion', 'electronics'] },
  { id: 'fp_12', heading: 'Bebas Neue', body: 'Open Sans', vibe: ['urban', 'strong'], verticals: ['fashion'] },
  { id: 'fp_13', heading: 'Archivo Black', body: 'Work Sans', vibe: ['statement', 'edgy'], verticals: ['fashion'] },
  
  // Soft / Feminine
  { id: 'fp_14', heading: 'Tenor Sans', body: 'Jost', vibe: ['soft', 'feminine'], verticals: ['beauty', 'wellness', 'jewellery'] },
  { id: 'fp_15', heading: 'Josefin Sans', body: 'Quicksand', vibe: ['delicate', 'airy'], verticals: ['beauty', 'wellness'] },
  
  // Indian Traditional
  { id: 'fp_16', heading: 'EB Garamond', body: 'Source Serif Pro', vibe: ['traditional', 'ethnic'], verticals: ['jewellery', 'fashion'] },
  { id: 'fp_17', heading: 'Spectral', body: 'Karla', vibe: ['heritage', 'refined'], verticals: ['jewellery', 'homedecor'] },
  
  // Playful / Youth
  { id: 'fp_18', heading: 'Sora', body: 'Nunito', vibe: ['playful', 'youth'], verticals: ['general', 'food'] },
  { id: 'fp_19', heading: 'Outfit', body: 'Plus Jakarta Sans', vibe: ['fresh', 'dynamic'], verticals: ['general', 'beauty'] },
  
  // Utility
  { id: 'fp_20', heading: 'Inter', body: 'Inter', vibe: ['neutral', 'system'], verticals: ['general', 'electronics'] },
];

// Map of common font names to their closest Google Font equivalent
export const FONT_ALIASES: Record<string, string> = {
  'Arial': 'Inter',
  'Helvetica': 'Inter',
  'Helvetica Neue': 'Inter',
  'system-ui': 'Inter',
  '-apple-system': 'Inter',
  'BlinkMacSystemFont': 'Inter',
  'Segoe UI': 'Inter',
  'Times New Roman': 'Libre Baskerville',
  'Georgia': 'Lora',
  'Verdana': 'Open Sans',
  'Tahoma': 'Open Sans',
  'Trebuchet MS': 'Nunito Sans',
  'Courier New': 'Space Mono',
};
