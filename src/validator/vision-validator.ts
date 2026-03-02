// ═══════════════════════════════════════════════════════════════
// Vision Validator
// Uses Claude Haiku to verify DOM-based section classification
// against the actual screenshot. Catches what DOM heuristics miss:
// - "Vibe" detection (luxury vs budget, traditional vs modern)
// - Vertical auto-detection from visual cues
// - Section misclassifications
//
// Cost: ~$0.005 per call. Only runs on compositions with
// heuristic score > 40 (about 60% of crawls).
// ═══════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import type { NormalizedSection, VisionValidationResult } from '../shared/types.js';

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

export async function validateWithVision(
  screenshot: Buffer,
  domSections: NormalizedSection[]
): Promise<VisionValidationResult> {
  const anthropic = getClient();

  const sectionList = domSections
    .map((s, i) => `${i + 1}. ${s.type} (confidence: ${(s.confidence * 100).toFixed(0)}%)`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot.toString('base64'),
            },
          },
          {
            type: 'text',
            text: `You are a web design analyst. I scraped this e-commerce homepage and my DOM classifier detected these sections:

${sectionList}

Analyze the screenshot and respond with ONLY this JSON (no markdown, no backticks):
{
  "agrees": true/false,
  "sections_you_see": ["hero_full_bleed", "trust_bar", ...],
  "vibe": ["luxury", "traditional", "minimal", ...],
  "vertical": "fashion|jewellery|beauty|food|homedecor|electronics|wellness|general",
  "disagreements": [{"position": 0, "dom_said": "X", "you_see": "Y"}],
  "notes": "brief explanation if disagreements"
}`,
          },
        ],
      },
    ],
  });

  // Parse response
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  let parsed: any;

  try {
    // Strip any markdown fencing
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('[VisionValidator] Failed to parse response:', text);
    return {
      agrees_with_dom: true, // assume agreement on parse failure
      detected_sections: [],
      detected_vibe: [],
      detected_vertical: 'general',
      disagreements: [],
      confidence_boost: 0,
      flagged_for_review: false,
    };
  }

  // Calculate confidence adjustment
  let confidenceBoost = 0;
  const disagreementCount = parsed.disagreements?.length || 0;

  if (parsed.agrees) {
    confidenceBoost = +15;
  } else if (disagreementCount <= 2) {
    confidenceBoost = +5;
  } else {
    confidenceBoost = -15;
  }

  return {
    agrees_with_dom: !!parsed.agrees,
    detected_sections: parsed.sections_you_see || [],
    detected_vibe: parsed.vibe || [],
    detected_vertical: parsed.vertical || 'general',
    disagreements: (parsed.disagreements || []).map((d: any) => ({
      position: d.position || 0,
      dom_said: d.dom_said || '',
      vision_says: d.you_see || '',
    })),
    confidence_boost: confidenceBoost,
    flagged_for_review: !parsed.agrees && disagreementCount > 2,
  };
}
