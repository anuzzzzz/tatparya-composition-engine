// ═══════════════════════════════════════════════════════════════
// Auto Scroll — Triggers lazy-loaded content
//
// FIX v3: Slower scroll with dynamic scrollHeight re-checking.
// Modern sites (React/Next.js hydration, IntersectionObserver
// lazy loading) grow their DOM as you scroll. The old version
// checked scrollHeight once and exited immediately if the page
// hadn't rendered yet.
//
// New approach:
//   - Smaller scroll distance (200px)
//   - Longer interval (300ms) for JS hydration breathing room
//   - Re-checks if scrollHeight grew after each scroll
//   - Multiple passes: scroll down, wait, scroll down again
//   - Max 30s safety timeout
// ═══════════════════════════════════════════════════════════════

import type { Page } from 'puppeteer';

export async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const distance = 200;
      const interval = 300;
      const maxTime = 30000; // 30s safety cap
      const startTime = Date.now();
      let stableCount = 0;
      let lastScrollHeight = 0;

      const timer = setInterval(() => {
        const currentScrollHeight = document.body.scrollHeight;
        const currentPos = window.scrollY + window.innerHeight;

        // Safety timeout
        if (Date.now() - startTime > maxTime) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
          return;
        }

        // Check if we've reached the bottom
        if (currentPos >= currentScrollHeight - 10) {
          // Did the page grow since last check?
          if (currentScrollHeight === lastScrollHeight) {
            stableCount++;
          } else {
            stableCount = 0;
          }
          lastScrollHeight = currentScrollHeight;

          // Page height hasn't changed for 3 consecutive checks at bottom
          // — content is fully loaded
          if (stableCount >= 3) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
            return;
          }
        }

        window.scrollBy(0, distance);
      }, interval);
    });
  });
}
