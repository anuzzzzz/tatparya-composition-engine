// ═══════════════════════════════════════════════════════════════
// Archetype Distiller
// This system is a PATTERN MINING ENGINE, not a scraper.
// Output: 8-15 archetypes per vertical, each representing
// a recurring layout DNA pattern validated across dozens of stores.
// ═══════════════════════════════════════════════════════════════

import type { NormalizedComposition, Archetype } from '../shared/types.js';
import { computeVector, vectorToArray, weightedCosineSimilarity } from './vector-dedup.js';

export function distillArchetypes(
  compositions: NormalizedComposition[],
  maxPerVertical = 15
): Map<string, Archetype[]> {
  const archetypes = new Map<string, Archetype[]>();

  // Group by vertical
  const byVertical = new Map<string, NormalizedComposition[]>();
  for (const comp of compositions) {
    const v = comp.source.vertical || 'general';
    if (!byVertical.has(v)) byVertical.set(v, []);
    byVertical.get(v)!.push(comp);
  }

  for (const [vertical, comps] of byVertical) {
    const clusters = greedyCluster(comps, vertical, 0.80);

    const verticalArchetypes: Archetype[] = clusters
      .sort((a, b) => b.members.length - a.members.length)
      .slice(0, maxPerVertical)
      .map((cluster, idx) => {
        const representative = cluster.members
          .sort((a, b) => b.quality_score - a.quality_score)[0];

        return {
          id: `archetype_${vertical}_${idx}`,
          name: generateArchetypeName(representative, cluster.members.length),
          vertical,
          cluster_size: cluster.members.length,
          confidence: cluster.members.length / comps.length,
          representative_source: representative.source.url,
          section_pattern: representative.sections.map(s => ({
            type: s.type,
            variant: s.detected_variant,
            required: s.confidence > 0.7,
            background_hint: s.is_dark ? 'dark' as const : 'light' as const,
            position: s.position,
          })),
          palette_centroid: averageClusterPalettes(cluster.members),
          tags: [...new Set(cluster.members.flatMap(m => m.tags))].slice(0, 10),
          quality_score: representative.quality_score,
          vector: vectorToArray(computeVector(representative)),
          member_ids: cluster.members.map(m => m.id),
        };
      });

    archetypes.set(vertical, verticalArchetypes);
  }

  return archetypes;
}

interface Cluster {
  centroid: number[];
  members: NormalizedComposition[];
}

function greedyCluster(
  comps: NormalizedComposition[],
  vertical: string,
  threshold: number
): Cluster[] {
  const clusters: Cluster[] = [];

  for (const comp of comps) {
    const vec = vectorToArray(computeVector(comp));

    let bestCluster = -1;
    let bestSim = 0;
    for (let i = 0; i < clusters.length; i++) {
      const sim = weightedCosineSimilarity(vec, clusters[i].centroid, vertical);
      if (sim > bestSim) { bestSim = sim; bestCluster = i; }
    }

    if (bestSim > threshold && bestCluster >= 0) {
      const c = clusters[bestCluster];
      c.members.push(comp);
      // Running average centroid
      const newVec = vectorToArray(computeVector(comp));
      for (let i = 0; i < c.centroid.length; i++) {
        c.centroid[i] = (c.centroid[i] * (c.members.length - 1) + newVec[i]) / c.members.length;
      }
    } else {
      clusters.push({ centroid: vec, members: [comp] });
    }
  }

  return clusters;
}

function averageClusterPalettes(members: NormalizedComposition[]) {
  const n = members.length;
  return {
    avg_gold_proportion: members.reduce((a, m) =>
      a + (m.palette?.indian_color_signals?.gold_proportion || 0), 0) / n,
    avg_maroon_proportion: members.reduce((a, m) =>
      a + (m.palette?.indian_color_signals?.maroon_proportion || 0), 0) / n,
    dark_theme_ratio: members.filter(m => m.palette?.is_dark_theme).length / n,
  };
}

function generateArchetypeName(comp: NormalizedComposition, clusterSize: number): string {
  const vibes = comp.tags.slice(0, 2).join(' ');
  const vertical = comp.source.vertical || 'general';
  return `${vibes} ${vertical} (${clusterSize} stores)`.trim();
}
