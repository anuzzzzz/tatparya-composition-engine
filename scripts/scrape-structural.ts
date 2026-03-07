#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Structural Scraper v5 — TinyFish DOM Extraction
//
// /index.json doesn't work (Shopify serves HTML for most stores).
// Instead, uses TinyFish to load the homepage and extract
// .shopify-section elements directly from the rendered DOM.
//
// Requires: TINYFISH_API_KEY environment variable
//
// Usage:
//   npx tsx scripts/scrape-structural.ts
//   npx tsx scripts/scrape-structural.ts sources/indian-d2c-brands.json
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;
const API_URL = 'https://agent.tinyfish.ai/v1/automation/run-sse';

interface SectionInfo {
  id: string;
  type: string;
  height: number;
  tag: string;
}

interface StructuralResult {
  url: string;
  success: boolean;
  error?: string;
  section_count: number;
  sections: SectionInfo[];
  theme_name?: string;
  page_title?: string;
}

// The goal: extract Shopify section structure from the rendered homepage DOM
const EXTRACTION_GOAL = `
You are on a Shopify store's homepage. Extract ALL elements with the CSS class "shopify-section" from the page DOM.

For each .shopify-section element, extract:
1. Its "id" attribute (e.g. "shopify-section-header", "shopify-section-template--123__hero")
2. Its approximate height in pixels
3. The HTML tag name (usually "div" or "section")

Also extract:
- The page title
- The value of Shopify.theme.name from the JavaScript window object (if available)

Return ONLY this JSON:
{
  "page_title": "string",
  "theme_name": "string or null",
  "is_password_page": false,
  "sections": [
    {"id": "full-id-attribute", "height": 123, "tag": "div"}
  ]
}

If this is a password-protected page, return:
{"is_password_page": true, "sections": []}

IMPORTANT: Return the raw JSON only, no markdown formatting, no backticks.
`;

function inferTypeFromSectionId(id: string, height: number = -1): string {
  const lower = id.toLowerCase();

  // Strip common prefixes
  const cleaned = lower
    .replace('shopify-section-', '')
    .replace(/sections--\d+__/, '')
    .replace(/template--\d+__/, '')
    .replace(/_[a-z0-9]{6,}$/i, ''); // strip random suffixes like _4VCgQr

  // --- Original v5 rules ---
  if (cleaned.includes('header') || cleaned.includes('nav')) return 'header';
  if (cleaned.includes('footer')) return 'footer';
  if (cleaned.includes('announcement') || cleaned.includes('global-banner')) return 'announcement_bar';
  if (cleaned.includes('hero') || cleaned.includes('full-bleed')) return 'hero';
  if (cleaned.includes('slideshow') || cleaned.includes('slider') || cleaned.includes('carousel')) return 'slideshow';
  if (cleaned.includes('featured') && cleaned.includes('product')) return 'featured_products';
  if (cleaned.includes('featured') && cleaned.includes('collection')) return 'featured_collection';
  if (cleaned.includes('collection') && cleaned.includes('list')) return 'collection_list';
  if (cleaned.includes('collection') || cleaned.includes('category')) return 'collection';
  if (cleaned.includes('product') && cleaned.includes('carousel')) return 'product_carousel';
  if (cleaned.includes('product') && cleaned.includes('grid')) return 'product_grid';
  if (cleaned.includes('product')) return 'product';
  if (cleaned.includes('testimonial') || cleaned.includes('review')) return 'testimonials';
  if (cleaned.includes('newsletter') || cleaned.includes('subscribe') || cleaned.includes('email')) return 'newsletter';
  if (cleaned.includes('image') && cleaned.includes('text')) return 'image_with_text';
  if (cleaned.includes('rich') && cleaned.includes('text')) return 'rich_text';
  if (cleaned.includes('richtext')) return 'rich_text';
  if (cleaned.includes('video')) return 'video';
  if (cleaned.includes('logo') || cleaned.includes('brand')) return 'logo_bar';
  if (cleaned.includes('blog') || cleaned.includes('article')) return 'blog';
  if (cleaned.includes('map') || cleaned.includes('contact')) return 'contact';
  if (cleaned.includes('cart') && cleaned.includes('drawer')) return 'cart_drawer';
  if (cleaned.includes('cart')) return 'cart';
  if (cleaned.includes('popup') || cleaned.includes('modal')) return 'popup';
  if (cleaned.includes('promo') || cleaned.includes('tile')) return 'promo_tiles';
  if (cleaned.includes('shopping') && cleaned.includes('grid')) return 'shopping_grid';
  if (cleaned.includes('style') && cleaned.includes('panel')) return 'style_panel';
  if (cleaned.includes('seo')) return 'seo';
  if (cleaned.includes('geofenc') || cleaned.includes('geo')) return 'geofencing';
  if (cleaned.includes('marquee') || cleaned.includes('ticker')) return 'marquee';
  if (cleaned.includes('trust') || cleaned.includes('usp') || cleaned.includes('guarantee')) return 'trust_bar';

  // --- v6 additions — reduce "unknown" bucket ---
  if (cleaned.includes('banner')) return 'hero';
  if (cleaned.includes('spacer') || cleaned.includes('divider')) return 'spacer';
  if (cleaned.includes('quick_links') || cleaned.includes('quick-links')) return 'quick_links';
  if (cleaned.includes('flexible') || cleaned.includes('content_row') || cleaned.includes('content-row')) return 'flexible_content';
  if (cleaned.includes('fifty_fifty') || cleaned.includes('fifty-fifty') || cleaned.includes('split')) return 'image_with_text';
  if (cleaned.includes('featured_content') || cleaned.includes('featured-content')) return 'featured_products';
  if (cleaned.includes('about') || cleaned.includes('story') || cleaned.includes('mission')) return 'rich_text';
  if (cleaned.includes('categories')) return 'collection';
  if (cleaned.includes('paragraph') || cleaned.includes('generic_text') || cleaned.includes('generic-text')) return 'rich_text';
  if (cleaned.includes('newest') || cleaned.includes('new-arrival') || cleaned.includes('new_arrival')) return 'featured_products';
  if (cleaned.includes('featured-block') || cleaned.includes('featured_block')) return 'featured_products';
  if (cleaned.includes('reward') || cleaned.includes('loyalty') || cleaned.includes('treecounter')) return 'rewards_bar';
  if (cleaned.includes('animated') || cleaned.includes('cards')) return 'promo_tiles';
  if (cleaned.includes('ig-feed') || cleaned.includes('ig_feed') || cleaned.includes('instagram')) return 'social_feed';
  if (cleaned.includes('swatch') || cleaned.includes('badges') || cleaned.includes('redirect') || cleaned.includes('minisearch')) return 'utility';
  if (cleaned.includes('protect') || cleaned.includes('bopis') || cleaned.includes('optimization') || cleaned.includes('chatbot')) return 'app_embed';
  if (cleaned.includes('fireworks') || cleaned.includes('gradient') || cleaned.includes('screen-effect')) return 'visual_effect';
  if (cleaned === 'main' || cleaned.endsWith('__main')) return 'main_content';

  // Height=0 heuristic: unrecognized zero-height sections are hidden utility/app embeds
  if (height === 0) return 'app_embed';

  return 'unknown';
}

async function fetchWithTinyfish(url: string): Promise<StructuralResult> {
  const base = url.replace(/\/$/, '');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': TINYFISH_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: base,
        goal: EXTRACTION_GOAL,
        browser_profile: 'stealth',
      }),
    });

    if (!response.ok) {
      return { url, success: false, error: `API ${response.status}`, section_count: 0, sections: [] };
    }

    // Parse SSE stream — find COMPLETE event
    const text = await response.text();
    const lines = text.split('\n');

    let resultData: any = null;

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'COMPLETE' && event.status === 'COMPLETED' && event.resultJson) {
          resultData = event.resultJson;
          break;
        }
      } catch {}
    }

    if (!resultData) {
      return { url, success: false, error: 'stream_ended_without_result', section_count: 0, sections: [] };
    }

    // Handle string result
    if (typeof resultData === 'string') {
      try { resultData = JSON.parse(resultData); } catch {
        return { url, success: false, error: 'unparseable_result', section_count: 0, sections: [] };
      }
    }

    // Password check
    if (resultData.is_password_page) {
      return { url, success: false, error: 'password_protected', section_count: 0, sections: [] };
    }

    // Parse sections
    const rawSections = resultData.sections || [];
    if (rawSections.length === 0) {
      return { url, success: false, error: 'no_sections_found', section_count: 0, sections: [] };
    }

    const sections: SectionInfo[] = rawSections.map((s: any) => ({
      id: s.id || 'unknown',
      type: inferTypeFromSectionId(s.id || '', s.height || 0),
      height: s.height || 0,
      tag: s.tag || 'div',
    }));

    return {
      url,
      success: true,
      section_count: sections.length,
      sections,
      theme_name: resultData.theme_name || undefined,
      page_title: resultData.page_title || undefined,
    };

  } catch (err: any) {
    return { url, success: false, error: err.message?.substring(0, 100), section_count: 0, sections: [] };
  }
}

async function main() {
  if (!TINYFISH_API_KEY) {
    console.error('❌ TINYFISH_API_KEY not set. Get one at https://agent.tinyfish.ai/api-keys');
    process.exit(1);
  }
  console.log('✅ TINYFISH_API_KEY is set\n');

  const specificFile = process.argv[2];
  const targets: any[] = [];

  if (specificFile) {
    const data = JSON.parse(readFileSync(specificFile, 'utf-8'));
    targets.push(...data);
    console.log(`Loaded ${data.length} URLs from ${specificFile}`);
  } else {
    const sourcesDir = join(process.cwd(), 'sources');
    for (const file of ['shopify-theme-demos.json', 'top-shopify-stores.json', 'indian-d2c-brands.json']) {
      const path = join(sourcesDir, file);
      if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        targets.push(...data);
        console.log(`Loaded ${data.length} URLs from ${file}`);
      }
    }
  }

  console.log(`\n📋 Extracting section structure for ${targets.length} stores via TinyFish...\n`);

  const results: StructuralResult[] = [];
  let success = 0, failed = 0, passworded = 0;

  // Sequential processing (each takes ~30-60s with TinyFish)
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const progress = `[${i + 1}/${targets.length}]`;

    console.log(`  Requesting ${target.url}`);
    const result = await fetchWithTinyfish(target.url);
    results.push(result);

    if (result.success) {
      success++;
      const contentSections = result.sections.filter(s =>
        !['popup', 'cart', 'cart_drawer', 'geofencing'].includes(s.type) && s.height > 0
      );
      const types = contentSections.map(s => s.type).slice(0, 8);
      console.log(`${progress} ✅ ${target.url} — ${result.section_count} sections (${contentSections.length} visible)`);
      if (result.theme_name) console.log(`       Theme: ${result.theme_name}`);
      if (types.length) console.log(`       ${types.join(' → ')}${contentSections.length > 8 ? ' → ...' : ''}`);
    } else if (result.error?.includes('password')) {
      passworded++;
      console.log(`${progress} 🔒 ${target.url}`);
    } else {
      failed++;
      console.log(`${progress} ❌ ${target.url} — ${result.error}`);
    }

    // Small delay
    if (i < targets.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // ── Summary ──
  console.log(`\n═══════════════════════════════════════════`);
  console.log(` Structural Scrape Summary`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  ✅ Success:    ${success}`);
  console.log(`  🔒 Password:   ${passworded}`);
  console.log(`  ❌ Failed:     ${failed}`);
  console.log(`  Total:         ${targets.length}`);
  console.log(`  Hit rate:      ${((success / targets.length) * 100).toFixed(1)}%`);

  // Theme distribution
  const themes: Record<string, number> = {};
  for (const r of results) {
    if (r.success && r.theme_name) {
      themes[r.theme_name] = (themes[r.theme_name] || 0) + 1;
    }
  }
  if (Object.keys(themes).length > 0) {
    console.log(`\n  Themes detected:`);
    for (const [theme, count] of Object.entries(themes).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${theme}: ${count}`);
    }
  }

  // Section type frequency (visible sections only)
  const typeFreq: Record<string, number> = {};
  for (const r of results) {
    if (!r.success) continue;
    for (const s of r.sections) {
      if (s.height > 0) {
        typeFreq[s.type] = (typeFreq[s.type] || 0) + 1;
      }
    }
  }
  if (Object.keys(typeFreq).length > 0) {
    console.log(`\n  Section type frequency (visible, across ${success} stores):`);
    const sorted = Object.entries(typeFreq).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted.slice(0, 20)) {
      console.log(`    ${type}: ${count}`);
    }
  }

  // Save
  const outDir = join(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'structural-data.json'), JSON.stringify(results, null, 2));
  const successOnly = results.filter(r => r.success);
  writeFileSync(join(outDir, 'structural-sections.json'), JSON.stringify(successOnly, null, 2));
  console.log(`\n💾 output/structural-data.json (${results.length} total)`);
  console.log(`💾 output/structural-sections.json (${successOnly.length} success)`);
}

main().catch(console.error);
