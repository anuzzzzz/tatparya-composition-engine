// ═══════════════════════════════════════════════════════════════
// Library Builder — Final assembly
// Takes all normalized+scored+deduped compositions → outputs
// composition-library.json with archetypes + templates.
// ═══════════════════════════════════════════════════════════════

import type { NormalizedComposition, CompositionLibrary, CompositionTemplate } from '../shared/types.js';
import { applyTimeDecay } from './time-decay.js';
import { deduplicateCompositions } from './vector-dedup.js';
import { distillArchetypes } from './archetype-distiller.js';

export function assembleLibrary(
  compositions: NormalizedComposition[],
  qualityThreshold = 50
): CompositionLibrary {
  // Apply time decay
  const withDecay = compositions.map(c => ({
    ...c,
    effective_score: applyTimeDecay(c.quality_score, new Date(c.crawled_at || Date.now())),
  }));

  // Filter by effective quality
  const qualified = withDecay.filter(c => (c.effective_score ?? 0) >= qualityThreshold);

  // Deduplicate
  const deduped = deduplicateCompositions(qualified);

  // Distill archetypes: 8-15 per vertical
  const archetypeMap = distillArchetypes(deduped);

  // Build archetype ID lookup
  const archetypeLookup = new Map<string, string>();
  for (const [, archs] of archetypeMap) {
    for (const arch of archs) {
      for (const memberId of arch.member_ids) {
        archetypeLookup.set(memberId, arch.id);
      }
    }
  }

  // Convert to templates
  const templates: CompositionTemplate[] = deduped.map(comp => ({
    id: comp.id,
    name: generateTemplateName(comp),
    source_url: comp.source.url,
    source_type: comp.source.type,
    vertical: comp.source.vertical || 'general',
    tags: comp.tags,
    quality_score: comp.quality_score,
    effective_score: comp.effective_score ?? comp.quality_score,
    crawled_at: comp.crawled_at || new Date().toISOString(),
    archetype_id: archetypeLookup.get(comp.id),
    sections: comp.sections.map(s => ({
      type: s.type,
      variant: s.detected_variant,
      required: s.confidence > 0.7,
      background_hint: s.is_dark ? 'dark' as const : 'light' as const,
      position: s.position,
    })),
    palette_hint: comp.palette ? {
      background: comp.palette.background,
      surface: comp.palette.surface,
      accent: comp.palette.accent,
      proportions: comp.palette.proportions,
      indian_signals: comp.palette.indian_color_signals,
    } : undefined,
    typography_hint: comp.typography ? {
      heading_font: comp.typography.heading_font,
      body_font: comp.typography.body_font,
    } : undefined,
  }));

  templates.sort((a, b) => b.effective_score - a.effective_score);

  // Stats
  let totalArchetypes = 0;
  for (const [, v] of archetypeMap) totalArchetypes += v.length;

  return {
    version: '3.0.0',
    generated_at: new Date().toISOString(),
    stats: {
      total_stores_crawled: compositions.length,
      total_compositions: compositions.length,
      compositions_after_dedup: deduped.length,
      compositions_after_quality_filter: qualified.length,
      total_archetypes: totalArchetypes,
      by_vertical: countBy(templates, t => t.vertical),
      by_source: countBy(templates, t => t.source_type),
    },
    archetypes: Object.fromEntries(archetypeMap),
    compositions: templates,
  };
}

function generateTemplateName(comp: NormalizedComposition): string {
  const vibes = comp.tags.slice(0, 2).join(' ');
  const vertical = comp.source.vertical || 'general';
  return `${vibes} ${vertical} #${comp.id.slice(-4)}`.trim();
}

function countBy<T>(arr: T[], fn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
