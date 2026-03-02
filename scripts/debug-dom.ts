#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// DOM Diagnostic — See what Puppeteer actually renders
// Usage: npx tsx scripts/debug-dom.ts https://www.nicobar.com
//
// Uses string-based evaluate to avoid esbuild __name injection.
// ═══════════════════════════════════════════════════════════════

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';

const url = process.argv[2] || 'https://www.nicobar.com';

// All browser-side code as a plain string (no esbuild transformation)
const DIAGNOSTIC_SCRIPT = `
function getDomState() {
  var shopifySections = document.querySelectorAll('.shopify-section');
  var sections = document.querySelectorAll('section');
  var main = document.querySelector('main') || document.querySelector('[role="main"]') || document.querySelector('#MainContent');
  var footer = document.querySelector('footer');

  function getTree(el, depth, maxChildren) {
    if (depth > 4 || !el) return '';
    maxChildren = maxChildren || 8;
    var tag = (el.tagName || '?').toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.split(' ').filter(Boolean).slice(0, 3).join('.')
      : '';
    var rect = el.getBoundingClientRect();
    var style = getComputedStyle(el);
    var vis = style.display === 'none' ? ' [HIDDEN]' : style.visibility === 'hidden' ? ' [INVIS]' : '';
    var info = tag + id + cls + ' [' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ']' + vis;
    var children = Array.from(el.children)
      .slice(0, maxChildren)
      .map(function(c) { return getTree(c, depth + 1, 5); })
      .filter(Boolean);
    var indent = '';
    for (var i = 0; i < depth; i++) indent += '  ';
    var more = el.children.length > maxChildren
      ? '\\n' + indent + '  ... +' + (el.children.length - maxChildren) + ' more'
      : '';
    return indent + info + (children.length ? '\\n' + children.join('\\n') + more : '');
  }

  var ssInfo = Array.from(shopifySections).slice(0, 20).map(function(s) {
    var st = getComputedStyle(s);
    var r = s.getBoundingClientRect();
    return {
      id: s.id,
      height: Math.round(r.height),
      width: Math.round(r.width),
      display: st.display,
      visibility: st.visibility,
      opacity: st.opacity,
      position: st.position,
      zIndex: st.zIndex,
      childCount: s.children.length,
    };
  });

  return {
    bodyHeight: document.body.scrollHeight,
    bodyChildren: document.body.children.length,
    shopifySectionCount: shopifySections.length,
    sectionCount: sections.length,
    hasMain: !!main,
    mainTag: main ? main.tagName : null,
    mainId: main ? main.id : null,
    mainChildren: main ? main.children.length : 0,
    mainHeight: main ? Math.round(main.getBoundingClientRect().height) : 0,
    hasFooter: !!footer,
    footerHeight: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
    shopifySections: ssInfo,
    bodyTree: getTree(document.body, 0, 8),
  };
}

function getBotCheck() {
  var html = document.documentElement.outerHTML;
  return {
    hasChallenge: html.indexOf('challenge') >= 0 || html.indexOf('captcha') >= 0 || html.indexOf('cf-browser') >= 0,
    hasCloudflare: html.indexOf('cloudflare') >= 0 || html.indexOf('cf-ray') >= 0,
    hasShopifyPassword: html.indexOf('password-page') >= 0 || html.indexOf('store-password') >= 0,
    hasGeoBlock: html.indexOf('geo-block') >= 0 || html.indexOf('country-redirect') >= 0,
    bodyClasses: (document.body.className || '').substring(0, 200),
    htmlClasses: (document.documentElement.className || '').substring(0, 200),
    metaRobots: (document.querySelector('meta[name="robots"]') || {}).content || 'none found',
    pageTitle: document.title,
  };
}
`;

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log(`\n🔍 Navigating to ${url}...`);
  const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  console.log(`   Status: ${response?.status()}`);
  console.log(`   URL after redirect: ${page.url()}`);

  // Inject diagnostic functions as raw JS (avoids __name issue)
  await page.addScriptTag({ content: DIAGNOSTIC_SCRIPT });

  // ── Phase 1: Immediate ──
  console.log('\n═══ PHASE 1: IMMEDIATE (after networkidle2) ═══');
  await printDomState(page);

  // ── Phase 2: After 5s wait ──
  await new Promise(r => setTimeout(r, 5000));
  console.log('\n═══ PHASE 2: AFTER 5s WAIT ═══');
  await printDomState(page);

  // ── Phase 3: After scroll ──
  console.log('\n═══ PHASE 3: SCROLLING... ═══');
  await page.evaluate(`
    (async function() {
      for (var i = 0; i < 30; i++) {
        window.scrollBy(0, 400);
        await new Promise(function(r) { setTimeout(r, 400); });
      }
      window.scrollTo(0, 0);
    })()
  `);
  await new Promise(r => setTimeout(r, 3000));
  console.log('═══ PHASE 3: AFTER SCROLL + 3s SETTLE ═══');
  await printDomState(page);

  // ── Phase 4: Bot detection ──
  console.log('\n═══ PHASE 4: BOT DETECTION CHECK ═══');
  const botCheck: any = await page.evaluate('getBotCheck()');
  console.log('  Page title:', botCheck.pageTitle);
  console.log('  Challenge page:', botCheck.hasChallenge);
  console.log('  Cloudflare:', botCheck.hasCloudflare);
  console.log('  Shopify password:', botCheck.hasShopifyPassword);
  console.log('  Geo-block:', botCheck.hasGeoBlock);
  console.log('  Body classes:', botCheck.bodyClasses);
  console.log('  HTML classes:', botCheck.htmlClasses);
  console.log('  Meta robots:', botCheck.metaRobots);

  // ── Screenshot ──
  mkdirSync('output', { recursive: true });
  const screenshot = await page.screenshot({ fullPage: true }) as Buffer;
  writeFileSync('output/debug-screenshot.png', screenshot);
  console.log(`\n📸 Debug screenshot saved: output/debug-screenshot.png (${screenshot.length} bytes, check dimensions!)`);

  await browser.close();
}

async function printDomState(page: any) {
  const info: any = await page.evaluate('getDomState()');

  console.log(`  Body scrollHeight: ${info.bodyHeight}`);
  console.log(`  Body children: ${info.bodyChildren}`);
  console.log(`  .shopify-section count: ${info.shopifySectionCount}`);
  console.log(`  <section> count: ${info.sectionCount}`);
  console.log(`  Has main: ${info.hasMain} (${info.mainTag}#${info.mainId}, ${info.mainChildren} children, h=${info.mainHeight})`);
  console.log(`  Has footer: ${info.hasFooter} (h=${info.footerHeight})`);

  if (info.shopifySections.length > 0) {
    console.log(`\n  Shopify sections:`);
    info.shopifySections.forEach((s: any, i: number) => {
      console.log(`    ${i}: id="${s.id}" ${s.width}x${s.height} disp=${s.display} vis=${s.visibility} opa=${s.opacity} pos=${s.position} z=${s.zIndex} kids=${s.childCount}`);
    });
  }

  console.log(`\n  DOM Tree:`);
  console.log(info.bodyTree);
}

main().catch(console.error);
