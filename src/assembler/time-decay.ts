// ═══════════════════════════════════════════════════════════════
// Time Decay — 6-month half-life
// Newer designs get priority over older ones.
// A composition crawled 6 months ago has 50% effective weight.
// ═══════════════════════════════════════════════════════════════

export function applyTimeDecay(qualityScore: number, crawledAt: Date): number {
  const now = new Date();
  const ageMs = now.getTime() - crawledAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const halfLifeDays = 180; // 6 months
  const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);
  return qualityScore * decayFactor;
}
