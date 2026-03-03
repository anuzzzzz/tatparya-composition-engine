#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// URL Health Check — quickly test which URLs are actually accessible
// Uses Puppeteer but only navigates (no extraction/scrolling)
//
// Usage: npx tsx scripts/check-urls.ts [sources/file.json]
//        npx tsx scripts/check-urls.ts   (checks all source files)
// ═══════════════════════════════════════════════════════════════

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface Target { url: string; source?: string; vertical?: string; }
interface Result { url: string; status: string; finalUrl: string; title: string; hasShopifySections: number; bodyHeight: number; }

async function main() {
  const specificFile = process.argv[2];
  const targets: Target[] = [];

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

  console.log(`\nChecking ${targets.length} URLs...\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const results: Result[] = [];
  let ok = 0, passworded = 0, errors = 0, other = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const progress = `[${i + 1}/${targets.length}]`;

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      const response = await page.goto(target.url, {
        waitUntil: 'domcontentloaded', // Fast — don't wait for full load
        timeout: 15000
      });

      const finalUrl = page.url();
      const httpStatus = response?.status() || 0;

      // Quick DOM check (string-based to avoid __name)
      await page.addScriptTag({ content: `
        function quickCheck() {
          return {
            title: document.title || '',
            shopifySections: document.querySelectorAll('.shopify-section').length,
            bodyHeight: document.body ? document.body.scrollHeight : 0,
            isPassword: window.location.pathname.indexOf('/password') >= 0,
            hasMainContent: !!(document.querySelector('main') || document.querySelector('#MainContent')),
          };
        }
      `});
      const check: any = await page.evaluate('quickCheck()');

      await page.close();

      let status: string;
      if (check.isPassword || finalUrl.includes('/password')) {
        status = '🔒 PASSWORD';
        passworded++;
      } else if (httpStatus >= 400) {
        status = `❌ HTTP ${httpStatus}`;
        errors++;
      } else if (check.shopifySections >= 3 && check.bodyHeight > 1000) {
        status = '✅ OK';
        ok++;
      } else if (check.shopifySections > 0) {
        status = `⚠️ PARTIAL (${check.shopifySections} sections, h=${check.bodyHeight})`;
        ok++; // Still count as OK
      } else if (check.bodyHeight > 500) {
        status = '⚠️ NO SECTIONS (non-Shopify or custom)';
        other++;
      } else {
        status = '❓ EMPTY';
        other++;
      }

      results.push({
        url: target.url,
        status,
        finalUrl,
        title: check.title.substring(0, 60),
        hasShopifySections: check.shopifySections,
        bodyHeight: check.bodyHeight,
      });

      console.log(`${progress} ${status} ${target.url} — ${check.shopifySections} sections, h=${check.bodyHeight}`);

    } catch (err: any) {
      errors++;
      results.push({
        url: target.url,
        status: `❌ ERROR: ${err.message?.substring(0, 50)}`,
        finalUrl: '',
        title: '',
        hasShopifySections: 0,
        bodyHeight: 0,
      });
      console.log(`${progress} ❌ ${target.url} — ${err.message?.substring(0, 60)}`);
    }
  }

  await browser.close();

  // Summary
  console.log('\n═══════════════════════════════════════════');
  console.log(' URL Health Check Summary');
  console.log('═══════════════════════════════════════════');
  console.log(`  ✅ OK:          ${ok}`);
  console.log(`  🔒 Password:    ${passworded}`);
  console.log(`  ❌ Error:       ${errors}`);
  console.log(`  ❓ Other:       ${other}`);
  console.log(`  Total:          ${targets.length}`);
  console.log(`  Success rate:   ${((ok / targets.length) * 100).toFixed(1)}%`);

  // Save results
  writeFileSync('output/url-health-check.json', JSON.stringify(results, null, 2));

  // Save filtered list of working URLs
  const working = results.filter(r => r.status.startsWith('✅') || r.status.startsWith('⚠️ PARTIAL'));
  console.log(`\n  Working URLs saved: ${working.length}`);
  console.log(`  Full results: output/url-health-check.json`);
}

main().catch(console.error);
