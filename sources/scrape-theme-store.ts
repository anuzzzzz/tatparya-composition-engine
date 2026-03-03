#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Scrape Theme Store — v3
// Since themes.shopify.com blocks headless browsers, we use a
// hybrid approach:
//   1. Hardcoded list of known Shopify themes (from the store)
//   2. For each theme, try the demo URL with common preview params
//   3. Quick health check to keep only accessible ones
//
// Usage: npx tsx sources/scrape-theme-store.ts
// ═══════════════════════════════════════════════════════════════

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CrawlTarget } from '../src/shared/types.js';

// Known Shopify themes and their demo store patterns
// Collected from the Shopify Theme Store as of 2025
const KNOWN_THEMES: { name: string; demos: string[] }[] = [
  // Free Shopify themes
  { name: 'dawn', demos: ['dawn-theme-demo.myshopify.com'] },
  { name: 'horizon', demos: ['horizon-theme-original.myshopify.com'] },
  { name: 'craft', demos: ['craft-theme-default.myshopify.com'] },
  { name: 'refresh', demos: ['refresh-theme-default.myshopify.com'] },
  { name: 'sense', demos: ['sense-theme-demo.myshopify.com'] },
  { name: 'crave', demos: ['crave-theme-demo.myshopify.com'] },
  { name: 'studio', demos: ['studio-theme-demo.myshopify.com'] },
  { name: 'colorblock', demos: ['colorblock-theme-demo.myshopify.com'] },
  { name: 'taste', demos: ['taste-theme-demo.myshopify.com'] },
  { name: 'ride', demos: ['ride-theme-demo.myshopify.com'] },
  { name: 'spotlight', demos: ['spotlight-theme-demo.myshopify.com'] },

  // Paid themes with known working demos
  { name: 'prestige', demos: ['prestige-theme-demo.myshopify.com', 'prestige-theme-allure.myshopify.com', 'prestige-theme-couture.myshopify.com'] },
  { name: 'impulse', demos: ['impulse-theme-demo.myshopify.com', 'impulse-theme-modern.myshopify.com', 'impulse-theme-bold.myshopify.com'] },
  { name: 'motion', demos: ['motion-theme-demo.myshopify.com', 'motion-theme-classic.myshopify.com', 'motion-theme-elegant.myshopify.com'] },
  { name: 'broadcast', demos: ['broadcast-theme-demo.myshopify.com', 'broadcast-theme-clean.myshopify.com', 'broadcast-theme-bold.myshopify.com'] },
  { name: 'enterprise', demos: ['enterprise-theme-demo.myshopify.com', 'enterprise-theme-bold.myshopify.com'] },
  { name: 'pipeline', demos: ['pipeline-theme-demo.myshopify.com', 'pipeline-theme-bright.myshopify.com', 'pipeline-theme-dark.myshopify.com'] },
  { name: 'symmetry', demos: ['symmetry-theme-demo.myshopify.com', 'symmetry-theme-chantilly.myshopify.com', 'symmetry-theme-salt-yard.myshopify.com', 'symmetry-theme-duke.myshopify.com'] },
  { name: 'warehouse', demos: ['warehouse-theme-demo.myshopify.com', 'warehouse-theme-metal.myshopify.com', 'warehouse-theme-wood.myshopify.com'] },
  { name: 'testament', demos: ['testament-theme-demo.myshopify.com', 'testament-theme-bold.myshopify.com', 'testament-theme-playful.myshopify.com'] },
  { name: 'empire', demos: ['empire-theme-demo.myshopify.com', 'empire-theme-graphic.myshopify.com'] },
  { name: 'icon', demos: ['icon-theme-demo.myshopify.com', 'icon-theme-christian.myshopify.com'] },
  { name: 'parallax', demos: ['parallax-theme-demo.myshopify.com', 'parallax-theme-vienna.myshopify.com', 'parallax-theme-aspen.myshopify.com', 'parallax-theme-madrid.myshopify.com'] },
  { name: 'flow', demos: ['flow-theme-demo.myshopify.com', 'flow-theme-byron.myshopify.com', 'flow-theme-queenstown.myshopify.com'] },
  { name: 'impact', demos: ['impact-theme-demo.myshopify.com', 'impact-theme-sound.myshopify.com', 'impact-theme-graphic.myshopify.com'] },
  { name: 'focal', demos: ['focal-theme-demo.myshopify.com', 'focal-theme-carbon.myshopify.com', 'focal-theme-powder.myshopify.com'] },
  { name: 'context', demos: ['context-theme-demo.myshopify.com', 'context-theme-chic.myshopify.com'] },
  { name: 'label', demos: ['label-theme-demo.myshopify.com', 'label-theme-record.myshopify.com'] },
  { name: 'palo-alto', demos: ['palo-alto-theme-demo.myshopify.com', 'palo-alto-theme-stanford.myshopify.com'] },
  { name: 'story', demos: ['story-theme-demo.myshopify.com'] },
  { name: 'district', demos: ['district-theme-demo.myshopify.com'] },
  { name: 'responsive', demos: ['responsive-theme-demo.myshopify.com'] },
  { name: 'edition', demos: ['edition-theme-demo.myshopify.com', 'edition-theme-bold.myshopify.com'] },
  { name: 'expanse', demos: ['expanse-theme-demo.myshopify.com', 'expanse-theme-classic.myshopify.com', 'expanse-theme-modern.myshopify.com'] },
  { name: 'spark', demos: ['spark-theme-demo.myshopify.com'] },
  { name: 'split', demos: ['split-theme-demo.myshopify.com', 'split-theme-cuber.myshopify.com'] },
  { name: 'lorenza', demos: ['lorenza-theme-demo.myshopify.com', 'lorenza-theme-elegant.myshopify.com'] },
  { name: 'be-yours', demos: ['be-yours-theme-demo.myshopify.com', 'be-yours-theme-bold.myshopify.com'] },
  { name: 'canopy', demos: ['canopy-theme-demo.myshopify.com'] },
  { name: 'bullet', demos: ['bullet-theme-demo.myshopify.com', 'bullet-theme-sharp.myshopify.com'] },
];

async function main() {
  console.log('🔍 Checking Shopify Theme Demo URLs...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const targets: CrawlTarget[] = [];
  let checked = 0, accessible = 0, passworded = 0, dead = 0;

  for (const theme of KNOWN_THEMES) {
    for (const demo of theme.demos) {
      checked++;
      const url = `https://${demo}`;

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });

        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 12000,
        });

        const httpStatus = response?.status() || 0;
        const finalUrl = page.url();

        const check: any = await page.evaluate(() => {
          return {
            isPassword: window.location.pathname.indexOf('/password') >= 0 ||
                        !!document.querySelector('form[action*="/password"]'),
            shopifySections: document.querySelectorAll('.shopify-section').length,
            bodyHeight: document.body ? document.body.scrollHeight : 0,
          };
        });

        await page.close();

        if (httpStatus >= 400) {
          dead++;
          continue;
        }

        if (check.isPassword) {
          // Password-protected — still add it, the crawler's password handler will try to bypass
          passworded++;
          targets.push({
            url,
            source: 'shopify_theme_demo',
            theme_name: theme.name,
            needs_password: true,
          } as any);
          console.log(`  🔒 ${demo} — password-protected (will attempt bypass)`);
          continue;
        }

        if (check.shopifySections >= 3 || check.bodyHeight > 1000) {
          accessible++;
          targets.push({
            url,
            source: 'shopify_theme_demo',
            theme_name: theme.name,
          });
          console.log(`  ✅ ${demo} — ${check.shopifySections} sections`);
          continue;
        }

        dead++;

      } catch (err) {
        dead++;
      }
    }
  }

  await browser.close();

  console.log(`\n═══ Summary ═══`);
  console.log(`  Checked:     ${checked}`);
  console.log(`  ✅ Accessible: ${accessible}`);
  console.log(`  🔒 Password:   ${passworded} (will attempt bypass during crawl)`);
  console.log(`  ❌ Dead:       ${dead}`);
  console.log(`  Total saved:   ${targets.length}`);

  const outDir = join(process.cwd(), 'sources');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'shopify-theme-demos.json'), JSON.stringify(targets, null, 2));
  console.log(`\n💾 Saved ${targets.length} URLs to sources/shopify-theme-demos.json`);
}

main().catch(console.error);
