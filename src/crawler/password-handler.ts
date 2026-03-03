// ═══════════════════════════════════════════════════════════════
// Password Handler — Bypasses Shopify password pages
//
// Many theme demo stores are password-protected with common
// passwords like the theme name, 'shopify', '1', etc.
// This handler detects the password page and tries common ones.
// ═══════════════════════════════════════════════════════════════

import type { Page } from 'puppeteer';

// Common demo store passwords (theme devs frequently use these)
const COMMON_PASSWORDS = [
  '1', '2', '123', '1234',
  'shopify', 'password', 'demo', 'preview',
  'openup', 'letmein', 'welcome', 'store',
];

/**
 * Detects if the current page is a Shopify password page.
 * If so, attempts to bypass with common passwords and theme-name-based guesses.
 *
 * @returns true if page is accessible (either wasn't locked or was successfully bypassed)
 */
export async function handleShopifyPassword(page: Page, themeHint?: string): Promise<boolean> {
  const passwordCheck = await page.evaluate(() => {
    const url = window.location.href;
    const isPasswordUrl = url.includes('/password');
    const hasPasswordForm = !!document.querySelector('form[action*="/password"]');
    const hasPasswordInput = !!document.querySelector('input[type="password"]');

    // Try to extract password hint from the page
    // Some theme devs put the password in a paragraph or message
    let hintPassword: string | null = null;

    // Check for common hint locations
    const bodyText = document.body?.textContent || '';

    // Look for patterns like "Password: xyz" or "password is xyz" or "Enter password: xyz"
    const hintPatterns = [
      /password[:\s]+["']?(\w+)["']?/i,
      /enter\s+["']?(\w+)["']?\s+to\s+/i,
    ];

    for (const pattern of hintPatterns) {
      const match = bodyText.match(pattern);
      if (match && match[1] && match[1].length < 30) {
        hintPassword = match[1];
        break;
      }
    }

    // Also check meta tags
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      const content = metaDesc.getAttribute('content') || '';
      for (const pattern of hintPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          hintPassword = match[1];
          break;
        }
      }
    }

    return {
      isPasswordPage: isPasswordUrl || (hasPasswordForm && hasPasswordInput),
      hasPasswordInput,
      hintPassword,
    };
  });

  if (!passwordCheck.isPasswordPage) {
    return true; // Not a password page — all good
  }

  if (!passwordCheck.hasPasswordInput) {
    console.log('[Password] Password page detected but no input field found');
    return false;
  }

  console.log('[Password] 🔒 Password page detected, attempting bypass...');

  // Build password list: hint first, then theme name, then common ones
  const passwords: string[] = [];
  if (passwordCheck.hintPassword) {
    passwords.push(passwordCheck.hintPassword);
  }
  if (themeHint) {
    // Try theme name and variations: "dawn", "dawn-theme", "Dawn"
    const base = themeHint.toLowerCase().replace(/-theme.*$/, '').replace(/[^a-z0-9]/g, '');
    passwords.push(base);
    passwords.push(themeHint.toLowerCase());
  }
  passwords.push(...COMMON_PASSWORDS);

  // Deduplicate
  const uniquePasswords = [...new Set(passwords)];

  for (const pw of uniquePasswords) {
    try {
      // Clear any previous input
      await page.evaluate(() => {
        const input = document.querySelector('input[type="password"]') as HTMLInputElement;
        if (input) input.value = '';
      });

      // Type the password
      const input = await page.$('input[type="password"]');
      if (!input) break;

      await input.type(pw, { delay: 50 });

      // Submit
      await Promise.all([
        page.click('button[type="submit"], input[type="submit"], form[action*="/password"] button'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => null),
      ]);

      // Check if we got past the password page
      const stillLocked = await page.evaluate(() => {
        return window.location.href.includes('/password') ||
               !!document.querySelector('form[action*="/password"]');
      });

      if (!stillLocked) {
        console.log(`[Password] ✅ Bypass successful with: "${pw}"`);
        return true;
      }

      // Go back to password page for next attempt
      await page.goBack({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => null);

    } catch (err) {
      // Continue to next password
    }
  }

  console.log(`[Password] ❌ Bypass failed after ${uniquePasswords.length} attempts`);
  return false;
}
