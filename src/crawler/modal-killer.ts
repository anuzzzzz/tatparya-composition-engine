// ═══════════════════════════════════════════════════════════════
// Modal Killer
// Identifies and hides popups, modals, cookie bars, and marketing
// overlays so they don't contaminate section extraction.
// 
// Three strategies + body scroll restore + double-pass execution.
// ═══════════════════════════════════════════════════════════════

import type { Page } from 'puppeteer';

/**
 * Kill all modals, popups, cookie bars, and overlays on the page.
 * Should be called TWICE: once before scroll, once after scroll
 * (some popups trigger on scroll depth or delay).
 */
export async function killModalsAndPopups(page: Page): Promise<void> {
  await page.evaluate(() => {
    // ── Strategy 1: Class/ID-based detection (covers ~90%) ──
    const modalSelectors = [
      '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]',
      '[class*="klaviyo"]', '[class*="privy"]', '[class*="omnisend"]',
      '[class*="justuno"]', '[class*="wheelio"]', '[class*="spin-wheel"]',
      '[class*="cookie"]', '[class*="consent"]', '[class*="gdpr"]',
      '[class*="newsletter-popup"]', '[class*="exit-intent"]',
      '[class*="notification-bar"]', '[class*="announcement-popup"]',
      '[id*="popup"]', '[id*="modal"]', '[id*="overlay"]',
      '[id*="klaviyo"]', '[id*="cookie"]', '[id*="consent"]',
      '[data-popup]', '[data-modal]',
      '.shopify-section--popup',
    ];

    modalSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        (el as HTMLElement).style.display = 'none';
        (el as HTMLElement).style.visibility = 'hidden';
      });
    });

    // ── Strategy 2: z-index heuristic ──
    // Any element with z-index > 100 covering >30% of viewport is likely a modal.
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      const zIndex = parseInt(style.zIndex);

      if (zIndex > 100 && style.position !== 'static') {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const viewportArea = window.innerWidth * window.innerHeight;
        const elArea = rect.width * rect.height;

        // Covers more than 30% of viewport? Likely a modal overlay.
        if (elArea > viewportArea * 0.3) {
          (el as HTMLElement).style.display = 'none';
        }

        // Fixed position + high z-index + small height at bottom = cookie bar
        if (style.position === 'fixed' && rect.height < 200 && zIndex > 50) {
          if (rect.top > window.innerHeight * 0.7) {
            (el as HTMLElement).style.display = 'none';
          }
        }
      }
    });

    // ── Strategy 3: Remove backdrop/overlay elements ──
    document.querySelectorAll('[class*="backdrop"], [class*="underlay"]').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });

    // ── Restore body scroll (modals often lock it) ──
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  });
}
