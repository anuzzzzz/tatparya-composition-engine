#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// PDP Structural Scraper — TinyFish DOM Extraction
//
// Scrapes product detail pages from Indian D2C stores to extract
// which PDP elements are present. Builds a data asset that drives
// which PDP components render per vertical in Tatparya.
//
// Same architecture as scrape-structural.ts (homepage sections)
// but targets product pages instead.
//
// Requires: TINYFISH_API_KEY environment variable
//
// Usage:
//   npx tsx scripts/scrape-pdp-structural.ts
//   npx tsx scripts/scrape-pdp-structural.ts sources/indian-d2c-pdp-urls.json
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;
const API_URL = 'https://agent.tinyfish.ai/v1/automation/run-sse';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface PDPElement {
  type: string;
  present: boolean;
  details?: Record<string, any>;
}

interface PDPResult {
  url: string;
  product_url?: string;
  brand: string;
  vertical: string;
  sub_vertical: string;
  success: boolean;
  error?: string;
  elements: PDPElement[];
  product_info?: {
    name?: string;
    price?: string;
    has_compare_price?: boolean;
    currency?: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// TinyFish Goal — what to extract from each PDP
// ═══════════════════════════════════════════════════════════════

const PDP_EXTRACTION_GOAL = `
You are on an Indian e-commerce store. Your job is to navigate to a product detail page (PDP) and extract which UI elements are present.

STEP 1: If this is a collection/category page (shows multiple products), click on the FIRST product to navigate to its product detail page. Wait for the page to fully load.

STEP 2: Once on a product detail page, examine the page carefully and report which of these elements exist:

Return ONLY this JSON (set each "present" to true or false based on what you see):
{
  "product_url": "the final URL of the product page you're on",
  "product_info": {
    "name": "product name",
    "price": "displayed price including currency symbol",
    "has_compare_price": true/false (is there a strikethrough/original price?)
  },
  "elements": [
    {"type": "image_gallery", "present": true/false, "details": {"image_count": N, "has_thumbnails": true/false, "has_zoom": true/false}},
    {"type": "image_zoom", "present": true/false, "details": {"zoom_type": "hover|click|lightbox|pinch"}},
    {"type": "variant_selector", "present": true/false, "details": {"variant_types": ["size", "color", etc], "selector_style": "dropdown|buttons|swatches|pills"}},
    {"type": "color_swatches", "present": true/false, "details": {"swatch_style": "circles|squares|images", "count": N}},
    {"type": "size_chart", "present": true/false, "details": {"trigger": "link|button|icon", "display": "modal|inline|accordion"}},
    {"type": "size_guide_table", "present": true/false, "details": {"columns": ["Size", "Chest", etc], "unit": "cm|inches|both"}},
    {"type": "quantity_selector", "present": true/false, "details": {"style": "plus_minus|dropdown|input"}},
    {"type": "add_to_cart_button", "present": true/false, "details": {"shows_price": true/false, "sticky_mobile": true/false}},
    {"type": "buy_now_button", "present": true/false},
    {"type": "wishlist_button", "present": true/false, "details": {"style": "heart_icon|text_link|both"}},
    {"type": "share_button", "present": true/false, "details": {"platforms": ["whatsapp", "facebook", etc]}},
    {"type": "pincode_delivery_check", "present": true/false, "details": {"shows_cod": true/false, "shows_estimated_date": true/false}},
    {"type": "delivery_estimate", "present": true/false, "details": {"text_example": "Delivery in 3-5 days"}},
    {"type": "cod_available_badge", "present": true/false},
    {"type": "stock_urgency", "present": true/false, "details": {"text_example": "Only 3 left", "style": "text|badge|bar"}},
    {"type": "discount_badge", "present": true/false, "details": {"format": "percentage|flat|both", "position": "on_image|near_price|both"}},
    {"type": "offer_banner", "present": true/false, "details": {"text_example": "Use code XYZ for 10% off"}},
    {"type": "emi_info", "present": true/false, "details": {"text_example": "Starting at ₹X/month"}},
    {"type": "trust_badges", "present": true/false, "details": {"badges": ["free_shipping", "authentic", "easy_returns", etc]}},
    {"type": "product_description", "present": true/false, "details": {"format": "paragraph|bullets|tabs|accordion"}},
    {"type": "description_tabs", "present": true/false, "details": {"tab_names": ["Description", "Shipping", etc]}},
    {"type": "material_specs", "present": true/false, "details": {"fields": ["Material", "Weight", etc]}},
    {"type": "dimensions_table", "present": true/false, "details": {"fields": ["Length", "Width", etc], "unit": "cm|inches"}},
    {"type": "care_instructions", "present": true/false},
    {"type": "key_features_bullets", "present": true/false, "details": {"count": N}},
    {"type": "reviews_section", "present": true/false, "details": {"shows_rating_summary": true/false, "shows_photos": true/false, "review_count_visible": true/false}},
    {"type": "star_rating_display", "present": true/false, "details": {"position": "near_title|near_price|below_title"}},
    {"type": "related_products", "present": true/false, "details": {"title": "You May Also Like", "count": N}},
    {"type": "recently_viewed", "present": true/false},
    {"type": "complete_the_look", "present": true/false},
    {"type": "breadcrumbs", "present": true/false},
    {"type": "product_tags", "present": true/false},
    {"type": "sku_display", "present": true/false},
    {"type": "inventory_status", "present": true/false, "details": {"shows_count": true/false, "text_example": "In Stock"}},
    {"type": "whatsapp_inquiry", "present": true/false},
    {"type": "payment_icons", "present": true/false, "details": {"icons": ["visa", "mastercard", "upi", etc]}},
    {"type": "return_policy_snippet", "present": true/false, "details": {"days": N}},
    {"type": "free_shipping_threshold", "present": true/false, "details": {"threshold": "₹X"}},
    {"type": "product_video", "present": true/false},
    {"type": "sticky_add_to_cart", "present": true/false, "details": {"position": "bottom|top", "mobile_only": true/false}},
    {"type": "social_proof", "present": true/false, "details": {"type": "X people viewing|Y sold today"}}
  ]
}

IMPORTANT:
- Return raw JSON only. No markdown, no backticks.
- Set "present": true ONLY if you can actually see the element on the page.
- For "details", fill in what you can observe. Leave empty {} if unsure.
- If you cannot reach a product page, return: {"error": "reason", "elements": []}
`;

// ═══════════════════════════════════════════════════════════════
// TinyFish API call
// ═══════════════════════════════════════════════════════════════

async function fetchPDPWithTinyfish(target: any): Promise<PDPResult> {
  const url = target.url.replace(/\/$/, '');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': TINYFISH_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        goal: PDP_EXTRACTION_GOAL,
        browser_profile: 'stealth',
      }),
    });

    if (!response.ok) {
      return {
        url, brand: target.brand, vertical: target.vertical, sub_vertical: target.sub_vertical,
        success: false, error: `API ${response.status}`, elements: [],
      };
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
      return {
        url, brand: target.brand, vertical: target.vertical, sub_vertical: target.sub_vertical,
        success: false, error: 'stream_ended_without_result', elements: [],
      };
    }

    // Handle string result
    if (typeof resultData === 'string') {
      try { resultData = JSON.parse(resultData); } catch {
        return {
          url, brand: target.brand, vertical: target.vertical, sub_vertical: target.sub_vertical,
          success: false, error: 'unparseable_result', elements: [],
        };
      }
    }

    if (resultData.error) {
      return {
        url, brand: target.brand, vertical: target.vertical, sub_vertical: target.sub_vertical,
        success: false, error: resultData.error, elements: [],
      };
    }

    const elements: PDPElement[] = (resultData.elements || []).map((el: any) => ({
      type: el.type,
      present: el.present === true,
      details: el.details || {},
    }));

    return {
      url,
      product_url: resultData.product_url || url,
      brand: target.brand,
      vertical: target.vertical,
      sub_vertical: target.sub_vertical,
      success: true,
      elements,
      product_info: resultData.product_info || undefined,
    };

  } catch (err: any) {
    return {
      url, brand: target.brand, vertical: target.vertical, sub_vertical: target.sub_vertical,
      success: false, error: err.message?.substring(0, 100), elements: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  if (!TINYFISH_API_KEY) {
    console.error('❌ TINYFISH_API_KEY not set. Get one at https://agent.tinyfish.ai/api-keys');
    process.exit(1);
  }
  console.log('✅ TINYFISH_API_KEY is set\n');

  const specificFile = process.argv[2] || join(process.cwd(), 'sources', 'indian-d2c-pdp-urls.json');
  if (!existsSync(specificFile)) {
    console.error(`❌ Source file not found: ${specificFile}`);
    process.exit(1);
  }

  const targets = JSON.parse(readFileSync(specificFile, 'utf-8'));
  console.log(`📋 Extracting PDP structure for ${targets.length} stores via TinyFish...\n`);

  const results: PDPResult[] = [];
  let success = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const progress = `[${i + 1}/${targets.length}]`;

    console.log(`  ${progress} Requesting ${target.brand} (${target.sub_vertical})...`);
    const result = await fetchPDPWithTinyfish(target);
    results.push(result);

    if (result.success) {
      success++;
      const presentElements = result.elements.filter(e => e.present);
      console.log(`  ${progress} ✅ ${target.brand} — ${presentElements.length} PDP elements found`);
      if (result.product_info?.name) {
        console.log(`       Product: ${result.product_info.name} (${result.product_info.price || 'no price'})`);
      }
      // Show first 8 present elements
      const types = presentElements.slice(0, 8).map(e => e.type);
      if (types.length) console.log(`       ${types.join(', ')}${presentElements.length > 8 ? ', ...' : ''}`);
    } else {
      failed++;
      console.log(`  ${progress} ❌ ${target.brand} — ${result.error}`);
    }

    // Delay between requests
    if (i < targets.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // ── Summary ──
  console.log(`\n═══════════════════════════════════════════`);
  console.log(` PDP Structural Scrape Summary`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  ✅ Success:    ${success}`);
  console.log(`  ❌ Failed:     ${failed}`);
  console.log(`  Total:         ${targets.length}`);
  console.log(`  Hit rate:      ${((success / targets.length) * 100).toFixed(1)}%`);

  // ── Element frequency (across all successful scrapes) ──
  const elementFreq: Record<string, number> = {};
  const successResults = results.filter(r => r.success);
  for (const r of successResults) {
    for (const el of r.elements) {
      if (el.present) {
        elementFreq[el.type] = (elementFreq[el.type] || 0) + 1;
      }
    }
  }

  if (Object.keys(elementFreq).length > 0) {
    console.log(`\n  PDP element frequency (across ${success} stores):`);
    const sorted = Object.entries(elementFreq).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted) {
      const pct = Math.round((count / success) * 100);
      const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
      console.log(`    ${bar} ${pct.toString().padStart(3)}% ${type} (${count}/${success})`);
    }
  }

  // ── Save ──
  const outDir = join(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, 'pdp-structural-data.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(outDir, 'pdp-structural-success.json'), JSON.stringify(successResults, null, 2));

  console.log(`\n💾 output/pdp-structural-data.json (${results.length} total)`);
  console.log(`💾 output/pdp-structural-success.json (${successResults.length} success)`);
  console.log(`\nRun 'npx tsx scripts/pdp-frequency-matrix.ts' to build the per-vertical matrix.`);
}

main().catch(console.error);
