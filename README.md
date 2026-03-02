# Tatparya Composition Engine

Standalone design intelligence pipeline that crawls e-commerce stores, extracts their design DNA, and outputs composition archetypes for the AI store builder.

## Architecture

```
Crawler (Puppeteer, dual-viewport 375px+1440px)
  → Modal Killer (3-strategy popup elimination)
  → Extractor (weighted composite section classifier, area-weighted palette, typography)
  → Pixel Clustering (k-means perceived palette validation)
  → Viewport Reconciler (mobile-first, visual prominence scoring)
  → Normalizer (Tatparya vocabulary mapping, font matching, palette classification)
  → Quality Scorer (conversion-aware: hero position, product grid, CTA density, visual rhythm)
  → Vision Validator (Claude Haiku screenshot verification, optional)
  → Vector Dedup (42-dim structural fingerprint + weighted cosine similarity)
  → Archetype Distiller (greedy clustering → 8-15 archetypes per vertical)
  → Library Builder (time decay + final JSON output)
```

## Quick Start

```bash
npm install
# Test on a single store:
npx tsx scripts/run-single-store.ts https://dawn-theme-demo.myshopify.com

# Run full pipeline:
npx tsx scripts/run-full-pipeline.ts

# Inspect archetypes:
npx tsx scripts/inspect-archetypes.ts fashion

# Validate output:
npx tsx scripts/validate-library.ts
```

## Data Sources

Add URL lists to `sources/`:
- `shopify-theme-demos.json` — Tier 1: ~3,200 theme demos
- `top-shopify-stores.json` — Tier 2: ~500-1000 live stores
- `indian-d2c-brands.json` — Tier 3: ~200 curated Indian D2C

## Output

`output/composition-library.json` — consumed by Tatparya's `selectCompositions()`.

Contains:
- **Archetypes**: 8-15 per vertical (the primary matching source)
- **Compositions**: Full template library with time-decay-adjusted scores

## Environment Variables

- `ANTHROPIC_API_KEY` — Required for Vision Validator (optional feature)
- `ENABLE_VISION=true` — Enable Claude Haiku screenshot validation (~$0.005/call)

## Key Design Decisions

| Decision | Why |
|---|---|
| Dual viewport (375+1440) | India is 90%+ mobile traffic |
| Modal killer double-pass | Popups trigger on scroll/delay |
| Weighted composite scoring | Simple heuristics break 20-30% of the time |
| Area-weighted palette with visual weight formula | Captures vibe, not just hex counts |
| Pixel clustering validation | DOM color ≠ perceived color |
| 42-dim vectors with vertical weights | Semantic dedup, not exact sequence matching |
| Structural fingerprint pre-dedup | O(1) elimination before expensive O(n²) |
| 8-15 archetypes per vertical | Pattern mining engine, not template scraper |
| 6-month time decay half-life | Design patterns evolve |
| JSON file output | Read-only at runtime, trivially cacheable |
