// ═══════════════════════════════════════════════════════════════
// Pixel Clustering — Screenshot-based perceived palette extraction
//
// DOM-based color extraction misses gradients, background images,
// overlays, and fixed elements. This takes a screenshot, downsamples
// it, runs k-means clustering, and returns the TRUE perceived palette.
//
// Used to validate and correct the DOM palette.
// ═══════════════════════════════════════════════════════════════

import type { PerceivedPalette } from '../shared/types.js';

/**
 * Extract the perceived color palette from a full-page screenshot.
 * Uses Sharp to downsample, then k-means clustering on pixels.
 */
export async function extractPerceivedPalette(
  screenshotBuffer: Buffer
): Promise<PerceivedPalette> {
  // Dynamic import — Sharp may not be available in all environments
  const sharp = (await import('sharp')).default;

  // Downsample to 100px wide for fast processing (~15-30K pixels)
  const { data, info } = await sharp(screenshotBuffer)
    .resize(100, null, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Extract RGB pixels
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  // K-means clustering (k=8 captures dominant + accent colors)
  const clusters = kMeansClustering(pixels, 8, 20);

  // Sort by pixel count (most dominant first)
  clusters.sort((a, b) => b.count - a.count);

  const totalPixels = pixels.length;

  return {
    perceived_colors: clusters.map(c => ({
      hex: rgbToHexLocal(
        Math.round(c.center[0]),
        Math.round(c.center[1]),
        Math.round(c.center[2])
      ),
      proportion: c.count / totalPixels,
      r: Math.round(c.center[0]),
      g: Math.round(c.center[1]),
      b: Math.round(c.center[2]),
    })),
    is_dark_perceived: clusters[0]
      ? (0.299 * clusters[0].center[0] +
         0.587 * clusters[0].center[1] +
         0.114 * clusters[0].center[2]) < 128
      : false,
  };
}

// ── K-Means Clustering (no dependencies) ──

interface Cluster {
  center: [number, number, number];
  count: number;
}

function kMeansClustering(
  pixels: [number, number, number][],
  k: number,
  maxIterations: number
): Cluster[] {
  if (pixels.length === 0) return [];

  // Initialize centers from evenly spaced pixels
  const centers: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(pixels.length / k));
  for (let i = 0; i < k; i++) {
    const idx = Math.min(i * step, pixels.length - 1);
    centers.push([...pixels[idx]]);
  }

  const assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assign each pixel to nearest center
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let j = 0; j < k; j++) {
        const dist =
          (pixels[i][0] - centers[j][0]) ** 2 +
          (pixels[i][1] - centers[j][1]) ** 2 +
          (pixels[i][2] - centers[j][2]) ** 2;
        if (dist < minDist) {
          minDist = dist;
          bestCluster = j;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed) break; // converged

    // Recompute centers
    const sums = Array.from({ length: k }, () => [0, 0, 0] as [number, number, number]);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        centers[j] = [
          sums[j][0] / counts[j],
          sums[j][1] / counts[j],
          sums[j][2] / counts[j],
        ];
      }
    }
  }

  // Return clusters with counts
  const clusterCounts = new Array(k).fill(0);
  for (const a of assignments) clusterCounts[a]++;

  return centers.map((center, i) => ({ center, count: clusterCounts[i] }));
}

function rgbToHexLocal(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v =>
    Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  ).join('');
}
