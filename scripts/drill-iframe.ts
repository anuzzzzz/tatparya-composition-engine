#!/usr/bin/env tsx
// Check what's inside the Maker iframe
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'https://www.nicobar.com';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log(`Navigating to ${url}...`);
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

  // Step 1: Get iframe src from the main page
  await page.addScriptTag({ content: `
    function getIframeInfo() {
      var iframes = document.querySelectorAll('iframe');
      return Array.from(iframes).map(function(f) {
        var rect = f.getBoundingClientRect();
        return {
          src: f.src || f.getAttribute('src') || '(no src)',
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          id: f.id || '',
          parentId: f.parentElement ? f.parentElement.id : '',
          sandbox: f.getAttribute('sandbox') || '(none)',
          allow: f.getAttribute('allow') || '(none)',
        };
      }).filter(function(f) { return f.h > 100; });
    }
  `});
  const iframeInfo: any[] = await page.evaluate('getIframeInfo()');

  console.log(`\nFound ${iframeInfo.length} visible iframes:`);
  iframeInfo.forEach((f, i) => {
    console.log(`  ${i}: ${f.w}x${f.h} src="${f.src.substring(0, 150)}"`);
    console.log(`     id="${f.id}" parent="${f.parentId}" sandbox="${f.sandbox}"`);
  });

  // Step 2: Try to access iframe content via Puppeteer frames API
  const frames = page.frames();
  console.log(`\nPuppeteer frames: ${frames.length}`);

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const frameUrl = frame.url();
    if (frameUrl === 'about:blank' || frameUrl === url || frameUrl === url + '/') continue;

    console.log(`\n═══ Frame ${i}: ${frameUrl.substring(0, 120)} ═══`);

    try {
      // Inject our analysis into the iframe
      await frame.addScriptTag({ content: `
        function analyzeFrame() {
          var sections = document.querySelectorAll('section, [class*="section"], [data-section]');
          var allDivs = Array.from(document.body.children).filter(function(el) {
            var r = el.getBoundingClientRect();
            return r.height > 80 && r.width > 500;
          });

          function describeEl(el, depth) {
            if (depth > 3) return null;
            var rect = el.getBoundingClientRect();
            var style = getComputedStyle(el);
            if (rect.height < 20 || style.display === 'none') return null;
            var tag = el.tagName.toLowerCase();
            var id = el.id ? '#' + el.id : '';
            var cls = (el.className && typeof el.className === 'string')
              ? '.' + el.className.split(' ').filter(Boolean).slice(0, 3).join('.')
              : '';
            var imgs = el.querySelectorAll('img').length;
            var heading = (el.querySelector('h1,h2,h3') || {}).textContent;
            heading = heading ? heading.trim().substring(0, 60) : null;
            var kids = Array.from(el.children)
              .slice(0, 8)
              .map(function(c) { return describeEl(c, depth + 1); })
              .filter(Boolean);
            return {
              tag: tag + id + cls,
              w: Math.round(rect.width),
              h: Math.round(rect.height),
              vr: (rect.height / window.innerHeight).toFixed(2),
              imgs: imgs,
              heading: heading,
              kids: kids
            };
          }

          return {
            title: document.title,
            bodyHeight: document.body.scrollHeight,
            sectionCount: sections.length,
            bodyChildCount: allDivs.length,
            bodyTree: describeEl(document.body, 0)
          };
        }
      `});

      const result: any = await frame.evaluate('analyzeFrame()');
      console.log(`  Title: ${result.title}`);
      console.log(`  Body height: ${result.bodyHeight}`);
      console.log(`  Section-like elements: ${result.sectionCount}`);
      console.log(`  Large body children: ${result.bodyChildCount}`);
      console.log(`\n  DOM Tree:`);
      printTree(result.bodyTree, 1);

    } catch (err: any) {
      console.log(`  ERROR accessing frame: ${err.message?.substring(0, 100)}`);
    }
  }

  await browser.close();
}

function printTree(node: any, depth: number) {
  if (!node) return;
  const indent = '  '.repeat(depth);
  const extra = [];
  if (node.heading) extra.push(`"${node.heading}"`);
  if (node.imgs > 0) extra.push(`${node.imgs} imgs`);
  if (parseFloat(node.vr) > 0.3) extra.push(`vr=${node.vr}`);
  console.log(`${indent}${node.tag} [${node.w}x${node.h}] ${extra.join(' | ')}`);
  if (Array.isArray(node.kids)) {
    node.kids.forEach((c: any) => printTree(c, depth + 1));
  }
}

main().catch(console.error);
