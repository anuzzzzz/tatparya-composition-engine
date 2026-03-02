// ═══════════════════════════════════════════════════════════════
// Rate Limiter — Polite crawling
// 1 request per second with random jitter (1-3s)
// ═══════════════════════════════════════════════════════════════

export class RateLimiter {
  private lastRequestTime = 0;
  private minDelayMs: number;
  private maxDelayMs: number;

  constructor(minDelayMs = 1000, maxDelayMs = 3000) {
    this.minDelayMs = minDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const delay = this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs);
    
    if (elapsed < delay) {
      await new Promise(resolve => setTimeout(resolve, delay - elapsed));
    }
    
    this.lastRequestTime = Date.now();
  }
}
