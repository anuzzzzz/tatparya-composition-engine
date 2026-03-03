#!/usr/bin/env tsx
// Quick debug — dump raw TinyFish SSE response for one URL

import 'dotenv/config';

const API_KEY = process.env.TINYFISH_API_KEY;
if (!API_KEY) { console.error('Set TINYFISH_API_KEY'); process.exit(1); }

const url = process.argv[2] || 'https://prestige-theme-allure.myshopify.com';

const GOAL = `
Go to this URL. The page should show raw JSON data (a Shopify store's index.json).
Extract all the section IDs and types from the JSON.
Return this exact JSON format:
{
  "found_json": true/false,
  "sections": [{"id": "string", "type": "string", "settings_keys": [], "block_count": 0}],
  "section_order": ["id1", "id2"]
}
If it's not JSON or redirects, return {"found_json": false, "reason": "description"}
`;

async function main() {
  console.log(`🔍 Testing TinyFish on: ${url}/index.json\n`);

  const response = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: `${url}/index.json`,
      goal: GOAL,
      browser_profile: 'stealth',
    }),
  });

  console.log(`HTTP Status: ${response.status}`);
  console.log(`Content-Type: ${response.headers.get('content-type')}\n`);

  const text = await response.text();

  console.log('═══ RAW RESPONSE ═══');
  console.log(text.substring(0, 3000));
  console.log('═══ END ═══\n');

  // Try to parse SSE events
  const lines = text.split('\n');
  let eventCount = 0;

  console.log('═══ PARSED EVENTS ═══');
  for (const line of lines) {
    if (!line.trim()) continue;

    if (line.startsWith('data: ')) {
      eventCount++;
      try {
        const event = JSON.parse(line.slice(6));
        console.log(`\nEvent ${eventCount}:`);
        console.log(`  type: ${event.type}`);
        console.log(`  status: ${event.status}`);
        if (event.resultJson) {
          console.log(`  resultJson type: ${typeof event.resultJson}`);
          console.log(`  resultJson: ${JSON.stringify(event.resultJson).substring(0, 500)}`);
        }
        if (event.result) {
          console.log(`  result type: ${typeof event.result}`);
          console.log(`  result: ${JSON.stringify(event.result).substring(0, 500)}`);
        }
        if (event.message) {
          console.log(`  message: ${event.message.substring(0, 200)}`);
        }
        if (event.text) {
          console.log(`  text: ${event.text.substring(0, 200)}`);
        }
        // Log all keys
        console.log(`  keys: ${Object.keys(event).join(', ')}`);
      } catch {
        console.log(`\nEvent ${eventCount} (not JSON): ${line.substring(0, 200)}`);
      }
    } else if (line.startsWith('event:')) {
      console.log(`\n[SSE event type]: ${line}`);
    }
  }

  console.log(`\n═══ Total events: ${eventCount} ═══`);
}

main().catch(console.error);
