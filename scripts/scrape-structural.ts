#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Structural Scraper v4 — TinyFish Web Agent
//
// Uses TinyFish's managed stealth browsers to bypass
// Cloudflare/WAF and extract Shopify section structure.
//
// Requires: TINYFISH_API_KEY environment variable
//   export TINYFISH_API_KEY="your-key-here"
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
  settings_keys: string[];
  block_count: number;
  has_settings: boolean;
}

interface StructuralResult {
  url: string;
  success: boolean;
  error?: string;
  strategy?: string;
  section_count: number;
  section_order: string[];
  sections: SectionInfo[];
  raw_response?: any;
}

// Goal prompt for TinyFish — tells it exactly what JSON to return
const DIRECT_JSON_GOAL = `
Go to this exact URL. The page should show raw JSON data.
Extract all the section IDs and types from the Shopify template JSON.

Return this exact JSON format:
{
  "found_json": true/false,
  "sections": [{"id": "string", "type": "string", "settings_keys": [], "block_count": 0}],
  "section_order": ["id1", "id2"]
}

If it's not JSON or redirects to password page, return {"found_json": false, "reason": "description"}
`;

async function fetchWithTinyfish(url: string): Promise<StructuralResult> {
  const base = url.replace(/\/$/, '');
  const jsonUrl = `${base}/index.json`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': TINYFISH_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: jsonUrl,
        goal: DIRECT_JSON_GOAL,
        browser_profile: 'stealth',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        url, success: false, error: `API ${response.status}: ${errorText.substring(0, 100)}`,
        section_count: 0, section_order: [], sections: [],
      };
    }

    // Parse SSE stream
    const text = await response.text();
    const lines = text.split('\n');

    let resultData: any = null;

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      try {
        const event = JSON.parse(line.slice(6));

        if (event.type === 'COMPLETE' && event.status === 'COMPLETED') {
          resultData = event.resultJson || event.result;
          break;
        }

        // Also check for result in other event types
        if (event.resultJson) {
          resultData = event.resultJson;
        }
      } catch {
        // Not JSON, skip
      }
    }

    if (!resultData) {
      // Try parsing the entire response as JSON
      try {
        const fullParse = JSON.parse(text);
        if (fullParse.resultJson) resultData = fullParse.resultJson;
        else if (fullParse.sections) resultData = fullParse;
      } catch {}
    }

    if (!resultData) {
      return {
        url, success: false, error: 'no_result_in_sse',
        section_count: 0, section_order: [], sections: [],
        raw_response: text.substring(0, 500),
      };
    }

    // Handle string result (TinyFish might return stringified JSON)
    if (typeof resultData === 'string') {
      try {
        resultData = JSON.parse(resultData);
      } catch {
        return {
          url, success: false, error: 'unparseable_result',
          section_count: 0, section_order: [], sections: [],
          raw_response: resultData.substring(0, 500),
        };
      }
    }

    // Check if JSON was found
    if (resultData.found_json === false) {
      return {
        url, success: false, error: resultData.reason || 'no_json',
        section_count: 0, section_order: [], sections: [],
      };
    }

    // Parse sections
    const sections: SectionInfo[] = (resultData.sections || []).map((s: any) => ({
      id: s.id || 'unknown',
      type: s.type || 'unknown',
      settings_keys: s.settings_keys || [],
      block_count: s.block_count || 0,
      has_settings: (s.settings_keys || []).length > 0,
    }));

    if (sections.length === 0) {
      return {
        url, success: false, error: 'no_sections_found',
        section_count: 0, section_order: [], sections: [],
        raw_response: resultData,
      };
    }

    return {
      url, success: true, strategy: 'tinyfish_stealth',
      section_count: sections.length,
      section_order: resultData.section_order || sections.map(s => s.id),
      sections,
    };

  } catch (err: any) {
    return {
      url, success: false, error: err.message?.substring(0, 100),
      section_count: 0, section_order: [], sections: [],
    };
  }
}

async function main() {
  // Pre-flight check
  if (!TINYFISH_API_KEY) {
    console.error('❌ TINYFISH_API_KEY is not set.');
    console.error('   Get your key at: https://agent.tinyfish.ai/api-keys');
    console.error('   Then: export TINYFISH_API_KEY="your-key-here"');
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

  console.log(`\n📋 Fetching structural data for ${targets.length} stores via TinyFish...\n`);

  const results: StructuralResult[] = [];
  let success = 0, failed = 0, passworded = 0;

  // Process in small parallel batches (TinyFish handles concurrency well)
  const batchSize = 3; // Conservative to not burn credits too fast

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(t => fetchWithTinyfish(t.url))
    );

    for (const result of batchResults) {
      results.push(result);
      const idx = results.length;
      const progress = `[${idx}/${targets.length}]`;

      if (result.success) {
        success++;
        const types = result.sections
          .filter(s => !['popup', 'cart', 'unknown'].includes(s.type))
          .map(s => s.type)
          .slice(0, 8);
        console.log(`${progress} ✅ ${result.url} — ${result.section_count} sections`);
        if (types.length) console.log(`       ${types.join(' → ')}${result.section_count > 8 ? ' → ...' : ''}`);
      } else if (result.error?.includes('password')) {
        passworded++;
        console.log(`${progress} 🔒 ${result.url}`);
      } else {
        failed++;
        if (failed <= 20) console.log(`${progress} ❌ ${result.url} — ${result.error?.substring(0, 60)}`);
      }
    }

    // Small delay between batches
    if (i + batchSize < targets.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (failed > 20) console.log(`  ... and ${failed - 20} more failures`);

  // ── Summary ──
  console.log(`\n═══════════════════════════════════════════`);
  console.log(` Structural Scrape Summary (TinyFish)`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  ✅ Success:    ${success}`);
  console.log(`  🔒 Password:   ${passworded}`);
  console.log(`  ❌ Failed:     ${failed}`);
  console.log(`  Total:         ${targets.length}`);
  console.log(`  Hit rate:      ${((success / targets.length) * 100).toFixed(1)}%`);

  // Section type frequency
  const typeFreq: Record<string, number> = {};
  for (const r of results) {
    if (!r.success) continue;
    for (const s of r.sections) {
      typeFreq[s.type] = (typeFreq[s.type] || 0) + 1;
    }
  }

  if (Object.keys(typeFreq).length > 0) {
    console.log(`\n  Section type frequency (across ${success} stores):`);
    const sorted = Object.entries(typeFreq).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted.slice(0, 20)) {
      const pct = ((count / success) * 100).toFixed(0);
      console.log(`    ${type}: ${count} (${pct}% of stores)`);
    }
  }

  // Common sequences
  const seqCounts: Record<string, number> = {};
  for (const r of results) {
    if (!r.success) continue;
    const contentTypes = r.sections
      .map(s => s.type)
      .filter(t => !['header', 'footer', 'popup', 'cart', 'unknown'].includes(t))
      .slice(0, 5);
    if (contentTypes.length >= 3) {
      const key = contentTypes.join(' → ');
      seqCounts[key] = (seqCounts[key] || 0) + 1;
    }
  }

  const topSeqs = Object.entries(seqCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topSeqs.length > 0) {
    console.log(`\n  Most common section sequences:`);
    for (const [seq, count] of topSeqs) {
      console.log(`    [${count}x] ${seq}`);
    }
  }

  // Save
  const outDir = join(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'structural-data.json'), JSON.stringify(results, null, 2));

  const successOnly = results.filter(r => r.success);
  writeFileSync(join(outDir, 'structural-sections.json'), JSON.stringify(successOnly, null, 2));

  console.log(`\n💾 Full results: output/structural-data.json`);
  console.log(`💾 Success only: output/structural-sections.json (${successOnly.length} stores)`);
}

main().catch(console.error);
