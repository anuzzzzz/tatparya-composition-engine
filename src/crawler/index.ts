// ═══════════════════════════════════════════════════════════════
// Crawler — Dual-Viewport Orchestrator
// Manages the URL queue, loads pages at 375px + 1440px,
// injects the extractor, and produces CrawlResult objects.
//
// v5: Password handler for locked theme demos
//     iframe page builder detection
//     Structural readiness wait
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
import { handleShopifyPassword } from './password-handler.js';

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

    // Crawl desktop first — use it to detect iframe page builders early
    const desktop = await this.crawlViewport(target, 'desktop');

    // Check for iframe page builder on desktop extraction
    const iframeInfo = (desktop as any)._iframe_page_builder;
    if (iframeInfo) {
      console.log(
        `[Crawler] ⏭️  SKIP: ${target.url} — iframe page builder detected (${iframeInfo.builder})`
      );

      const result: CrawlResult = {
        target,
        desktop,
        mobile: desktop,
        reconciled_sections: [],
        metadata: {
          title: desktop.layout.title || '',
          description: desktop.layout.metaDescription || '',
          crawled_at: new Date().toISOString(),
          load_time_ms: Date.now() - start,
          total_height_desktop_px: desktop.layout.totalHeight,
          total_height_mobile_px: 0,
          skip_reason: `iframe_page_builder:${iframeInfo.builder}`,
          iframe_builder: iframeInfo.builder,
          iframe_src: iframeInfo.iframe_src,
        },
      };

      return result;
    }

    // Check for password page skip
    if ((desktop as any)._password_locked) {
      console.log(
        `[Crawler] 🔒 SKIP: ${target.url} — password-protected, bypass failed`
      );

      const result: CrawlResult = {
        target,
        desktop,
        mobile: desktop,
        reconciled_sections: [],
        metadata: {
          title: desktop.layout.title || '',
          description: desktop.layout.metaDescription || '',
          crawled_at: new Date().toISOString(),
          load_time_ms: Date.now() - start,
          total_height_desktop_px: desktop.layout.totalHeight,
          total_height_mobile_px: 0,
          skip_reason: 'password_locked',
        },
      };

      return result;
    }

    // No issues — proceed with mobile crawl
    const mobile = await this.crawlViewport(target, 'mobile');
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
   */
  private async waitForStructuralReadiness(page: Page): Promise<void> {
    const structuralSelectors = [
      'footer',
      '#shopify-section-footer',
      '[class*="footer"]',
      'main > *:nth-child(3)',
      '#MainContent > *:nth-child(3)',
      '[data-section-type]',
      '.shopify-section:nth-of-type(4)',
    ];

    try {
      await Promise.race([
        ...structuralSelectors.map(sel =>
          page.waitForSelector(sel, { timeout: 10000 }).catch(() => null)
        ),
        new Promise(r => setTimeout(r, 5000)),
      ]);
    } catch {
      console.log('[Crawler] Structural readiness timeout — proceeding');
    }

    // Hydration breathing room
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

      // ── Password handler (new in v5) ──
      // Extract theme name hint from target or URL
      const themeHint = (target as any).theme_name ||
        target.url.match(/\/\/([^.]+)/)?.[1]?.replace(/-theme.*$/, '') || undefined;

      const accessible = await handleShopifyPassword(page, themeHint);

      if (!accessible) {
        // Password page couldn't be bypassed — return minimal result with flag
        const screenshot = (await page.screenshot({ fullPage: true })) as Buffer;
        const result: any = {
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
          screenshot,
          _password_locked: true,
        };
        return result;
      }

      // Wait for structural readiness
      await this.waitForStructuralReadiness(page);

      // Kill modals BEFORE extraction (pass 1)
      await killModalsAndPopups(page);

      // Auto-scroll to trigger lazy loading
      await autoScroll(page);

      // Post-scroll settle
      await new Promise(r => setTimeout(r, 2000));

      // Kill modals AGAIN (pass 2)
      await killModalsAndPopups(page);

      // Final paint settle
      await page.evaluate('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})');

      // Inject extractor and run
      await page.addScriptTag({ content: getExtractorScript() });
      const extraction: any = await page.evaluate('extractDesignDNA()');

      // Take full-page screenshot
      const screenshot = (await page.screenshot({ fullPage: true })) as Buffer;

      // Build the result
      const result: ViewportExtraction & { _iframe_page_builder?: any } = {
        viewport,
        sections: extraction.sections,
        palette: extraction.palette,
        typography: extraction.typography,
        layout: extraction.layout,
        screenshot,
      };

      // Pass iframe flag through if detected
      if (extraction._iframe_page_builder) {
        (result as any)._iframe_page_builder = extraction._iframe_page_builder;
      }

      return result;
    } catch (err) {
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
