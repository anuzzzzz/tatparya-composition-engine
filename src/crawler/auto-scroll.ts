// ═══════════════════════════════════════════════════════════════
// Auto Scroll — Triggers lazy-loaded content
// Scrolls to bottom in increments, then back to top.
// ═══════════════════════════════════════════════════════════════

import type { Page } from 'puppeteer';

export async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0); // scroll back to top
          resolve();
        }
      }, 200);
    });
  });
}
