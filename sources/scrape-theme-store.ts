#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Scrape Theme Store
// Extracts demo store URLs from themes.shopify.com
// Outputs sources/shopify-theme-demos.json
// ═══════════════════════════════════════════════════════════════

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CrawlTarget } from '../src/shared/types.js';

async function main() {
  console.log('🔍 Scraping Shopify Theme Store for demo URLs...\n');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const targets: CrawlTarget[] = [];

  // Shopify theme store pages (paginated)
  // Note: Shopify may change their theme store structure.
  // This is a starting template — adjust selectors as needed.
  const baseUrl = 'https://themes.shopify.com/themes';

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract theme links from listing
    const themeLinks = await page.evaluate(() => {
      const links: string[] = [];
      document.querySelectorAll('a[href*="/themes/"]').forEach(a => {
        const href = (a as HTMLAnchorElement).href;
        if (href && !links.includes(href) && href.match(/\/themes\/[a-z-]+$/i)) {
          links.push(href);
        }
      });
      return links;
    });

    console.log(`Found ${themeLinks.length} theme links on first page`);

    // For each theme, find demo store URLs
    for (const themeLink of themeLinks.slice(0, 50)) { // limit for initial run
      try {
        await page.goto(themeLink, { waitUntil: 'networkidle2', timeout: 15000 });
        await new Promise(r => setTimeout(r, 1000));

        const demoUrls = await page.evaluate(() => {
          const demos: { url: string; presetName: string }[] = [];
          // Look for "View demo store" or preview links
          document.querySelectorAll('a[href*=".myshopify.com"], a[href*="preview"]').forEach(a => {
            const href = (a as HTMLAnchorElement).href;
            const text = a.textContent?.trim() || '';
            if (href.includes('.myshopify.com') || href.includes('preview')) {
              demos.push({ url: href, presetName: text || 'Default' });
            }
          });
          return demos;
        });

        const themeName = themeLink.split('/').pop() || 'unknown';
        for (const demo of demoUrls) {
          targets.push({
            url: demo.url,
            source: 'shopify_theme_demo',
            theme_name: themeName,
            preset_name: demo.presetName,
          });
        }

        console.log(`  ${themeName}: ${demoUrls.length} demos`);
        await new Promise(r => setTimeout(r, 1500)); // polite delay
      } catch (err) {
        console.warn(`  ⚠️ Failed to scrape ${themeLink}`);
      }
    }
  } finally {
    await browser.close();
  }

  // Save
  const outDir = join(process.cwd(), 'sources');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'shopify-theme-demos.json'), JSON.stringify(targets, null, 2));
  console.log(`\n💾 Saved ${targets.length} demo URLs to sources/shopify-theme-demos.json`);
}

main().catch(console.error);
