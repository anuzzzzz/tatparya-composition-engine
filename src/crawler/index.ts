// ═══════════════════════════════════════════════════════════════
// Crawler — Dual-Viewport Orchestrator
// Manages the URL queue, loads pages at 375px + 1440px,
// injects the extractor, and produces CrawlResult objects.
//
// FIX v3: Waits for structural readiness (footer or main content)
//         before scrolling. Longer post-scroll settle for hydration.
// ═══════════════════════════════════════════════════════════════

import puppeteer, { type Browser, type Page } from 'puppeteer';
import type {
  CrawlTarget, CrawlResult, ViewportExtraction, Viewport,
} from '../shared/types.js';
import { VIEWPORTS } from '../shared/types.js';
import { killModalsAndPopups } from './modal-killer.js';
import { autoScroll } from './auto-scroll.js';
import { reconcileViewports } from './viewport-reconciler.js';
import { RateLimiter } from './rate-limiter.js';
import { getExtractorScript } from '../extractor/inject.js';

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export class Crawler {
  private browser: Browser | null = null;
  private rateLimiter = new RateLimiter(1000, 3000);

  async init(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('[Crawler] Browser launched');
  }

  async destroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('[Crawler] Browser closed');
    }
  }

  /**
   * Crawl a single store at both viewports and return reconciled result.
   */
  async crawlStore(target: CrawlTarget): Promise<CrawlResult> {
    if (!this.browser) throw new Error('Crawler not initialized. Call init() first.');

    const start = Date.now();
    console.log(`[Crawler] Crawling ${target.url}`);

    // Crawl both viewports sequentially (same browser, different page configs)
    const desktop = await this.crawlViewport(target, 'desktop');
    const mobile = await this.crawlViewport(target, 'mobile');

    // Reconcile: merge desktop + mobile extractions
    const reconciled_sections = reconcileViewports(desktop, mobile);

    const result: CrawlResult = {
      target,
      desktop,
      mobile,
      reconciled_sections,
      metadata: {
        title: desktop.layout.title || mobile.layout.title || '',
        description: desktop.layout.metaDescription || '',
        crawled_at: new Date().toISOString(),
        load_time_ms: Date.now() - start,
        total_height_desktop_px: desktop.layout.totalHeight,
        total_height_mobile_px: mobile.layout.totalHeight,
      },
    };

    console.log(
      `[Crawler] Done: ${target.url} — ${reconciled_sections.length} sections, ` +
      `${Date.now() - start}ms`
    );

    return result;
  }

  /**
   * Crawl a batch of targets with rate limiting.
   */
  async crawlBatch(
    targets: CrawlTarget[],
    onResult?: (result: CrawlResult, index: number) => void,
    onError?: (error: Error, target: CrawlTarget, index: number) => void
  ): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    for (let i = 0; i < targets.length; i++) {
      await this.rateLimiter.wait();

      try {
        const result = await this.crawlStore(targets[i]);
        results.push(result);
        onResult?.(result, i);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[Crawler] Error on ${targets[i].url}: ${error.message}`);
        onError?.(error, targets[i], i);
      }
    }

    return results;
  }

  // ── Private ──

  /**
   * Wait for the page to be structurally ready.
   * Instead of relying solely on networkidle2, we wait for key DOM
   * elements that indicate the page has actually rendered its content.
   */
  private async waitForStructuralReadiness(page: Page): Promise<void> {
    // Strategy: wait for ANY of these structural markers (whichever appears first)
    // These indicate the page has rendered beyond just the initial shell.
    const structuralSelectors = [
      'footer',                       // Footer means full page rendered
      '#shopify-section-footer',      // Shopify-specific footer
      '[class*="footer"]',            // Generic footer class
      'main > *:nth-child(3)',        // At least 3 children in main = content loaded
      '#MainContent > *:nth-child(3)',// Shopify main content
      '[data-section-type]',          // Shopify section markers
      '.shopify-section:nth-of-type(4)', // At least 4 Shopify sections
    ];

    try {
      await Promise.race([
        // Wait for any structural marker
        ...structuralSelectors.map(sel =>
          page.waitForSelector(sel, { timeout: 10000 }).catch(() => null)
        ),
        // Fallback: just wait 5s if nothing appears
        new Promise(r => setTimeout(r, 5000)),
      ]);
    } catch {
      // If all selectors timeout, continue anyway
      console.log('[Crawler] Structural readiness timeout — proceeding with what we have');
    }

    // Extra breathing room for React/Next.js hydration
    await new Promise(r => setTimeout(r, 1500));
  }

  private async crawlViewport(
    target: CrawlTarget,
    viewport: Viewport
  ): Promise<ViewportExtraction> {
    const page = await this.browser!.newPage();

    try {
      await page.setViewport(VIEWPORTS[viewport]);

      if (viewport === 'mobile') {
        await page.setUserAgent(MOBILE_UA);
      }

      // Load the page
      await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for structural readiness (not just network idle)
      await this.waitForStructuralReadiness(page);

      // Kill modals BEFORE extraction (pass 1)
      await killModalsAndPopups(page);

      // Auto-scroll to trigger lazy loading
      // (auto-scroll now re-checks scrollHeight dynamically)
      await autoScroll(page);

      // Post-scroll settle — give IntersectionObservers and
      // lazy hydration time to fire after scroll completes
      await new Promise(r => setTimeout(r, 2000));

      // Kill modals AGAIN (pass 2 — some trigger on scroll/delay)
      await killModalsAndPopups(page);

      // Final readiness check: wait for any new sections that
      // appeared during scrolling to finish rendering
      await page.evaluate('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})');


      // Inject extractor and run
      // We use addScriptTag to inject the extractor as raw JS, avoiding
      // esbuild's __name helper which doesn't exist in the browser context.
      await page.addScriptTag({ content: getExtractorScript() });
      const extraction: any = await page.evaluate('extractDesignDNA()');

      // Take full-page screenshot
      const screenshot = (await page.screenshot({ fullPage: true })) as Buffer;

      return {
        viewport,
        sections: extraction.sections,
        palette: extraction.palette,
        typography: extraction.typography,
        layout: extraction.layout,
        screenshot,
      };
    } catch (err) {
      // Return empty extraction on failure rather than crashing the batch
      console.error(`[Crawler] Viewport ${viewport} failed for ${target.url}: ${err}`);
      return {
        viewport,
        sections: [],
        palette: {
          proportions: [], text_colors: [], accent_candidates: [],
          css_custom_properties: {},
          indian_color_signals: {
            has_gold: false, gold_proportion: 0,
            has_maroon: false, maroon_proportion: 0,
            has_saffron: false, has_deep_green: false,
          },
          dominant_bg: '#FFFFFF', is_dark_theme: false,
        },
        typography: {
          font_usage: {}, google_fonts_loaded: [],
          heading_font: null, body_font: null,
          base_font_size_px: null, heading_scale: null,
        },
        layout: {
          title: '', metaDescription: '', total_sections: 0,
          totalHeight: 0, viewport_height: VIEWPORTS[viewport].height,
          section_heights: [], dark_light_pattern: '', full_width_ratio: 0,
        },
        screenshot: Buffer.from([]),
      };
    } finally {
      await page.close();
    }
  }
}
