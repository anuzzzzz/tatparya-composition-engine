#!/usr/bin/env tsx
// Drill into the homepage_maker mega-section to see its internal structure
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'https://www.nicobar.com';

const DRILL_SCRIPT = `
function drillMegaSection() {
  var mega = document.querySelector('[id*="homepage_maker"]') ||
             document.querySelector('[id*="template--"]') ||
             Array.from(document.querySelectorAll('.shopify-section')).find(function(s) {
               return s.getBoundingClientRect().height > window.innerHeight * 2;
             });

  if (!mega) return { found: false };

  function describeEl(el, depth) {
    if (depth > 5) return null;
    var rect = el.getBoundingClientRect();
    var style = getComputedStyle(el);
    if (rect.height < 10 || style.display === 'none') return null;

    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.split(' ').filter(Boolean).slice(0, 3).join('.')
      : '';

    var imgs = el.querySelectorAll('img').length;
    var headings = el.querySelectorAll('h1,h2,h3').length;
    var heading_text = (el.querySelector('h1,h2,h3') || {}).textContent;
    heading_text = heading_text ? heading_text.trim().substring(0, 80) : null;

    var children = Array.from(el.children)
      .map(function(c) { return describeEl(c, depth + 1); })
      .filter(Boolean);

    return {
      tag: tag + id + cls,
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      vr: (rect.height / window.innerHeight).toFixed(2),
      imgs: imgs,
      headings: headings,
      heading_text: heading_text,
      text_len: el.textContent.trim().length,
      children: depth < 4 ? children : '(' + el.children.length + ' children)'
    };
  }

  return {
    found: true,
    megaId: mega.id,
    megaHeight: Math.round(mega.getBoundingClientRect().height),
    megaChildren: mega.children.length,
    tree: describeEl(mega, 0)
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

  console.log(`\nNavigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Scroll to trigger lazy loading
  await page.evaluate(`
    (async function() {
      for (var i = 0; i < 30; i++) {
        window.scrollBy(0, 400);
        await new Promise(function(r) { setTimeout(r, 300); });
      }
      window.scrollTo(0, 0);
    })()
  `);
  await new Promise(r => setTimeout(r, 2000));

  await page.addScriptTag({ content: DRILL_SCRIPT });
  const result: any = await page.evaluate('drillMegaSection()');

  if (!result.found) {
    console.log('No mega-section found!');
    await browser.close();
    return;
  }

  console.log(`\nMega section: ${result.megaId}`);
  console.log(`Height: ${result.megaHeight}px, Children: ${result.megaChildren}`);
  console.log('\nStructure (3 levels deep):');
  printTree(result.tree, 0);

  await browser.close();
}

function printTree(node: any, depth: number) {
  if (!node) return;
  const indent = '  '.repeat(depth);
  const extra = [];
  if (node.heading_text) extra.push(`"${node.heading_text}"`);
  if (node.imgs > 0) extra.push(`${node.imgs} imgs`);
  if (node.vr > 0.3) extra.push(`vr=${node.vr}`);

  console.log(`${indent}${node.tag} [${node.w}x${node.h}] ${extra.join(' | ')}`);

  if (Array.isArray(node.children)) {
    node.children.forEach((c: any) => printTree(c, depth + 1));
  } else if (node.children) {
    console.log(`${indent}  ${node.children}`);
  }
}

main().catch(console.error);
