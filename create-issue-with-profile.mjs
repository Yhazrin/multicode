import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const tempProfile = '/tmp/playwright-chrome-profile';
mkdirSync(tempProfile, { recursive: true });

const context = await chromium.launchPersistentContext(
  tempProfile,
  {
    headless: false,
    channel: 'chrome'
  }
);

const page = await context.newPage();
await page.goto('http://localhost:3000');
await page.waitForTimeout(3000);

console.log('URL after navigation:', page.url());
console.log('Title:', await page.title());

// Take a screenshot for debugging
await page.screenshot({ path: '/tmp/multicode-screenshot.png' });
console.log('Screenshot saved to /tmp/multicode-screenshot.png');

// Look at all visible text
const bodyText = await page.locator('body').innerText();
console.log('Body text (first 500 chars):', bodyText.substring(0, 500));

// Try to find issue-related links
const issueLinks = await page.locator('a[href*="issue"], a[href*="task"]').all();
console.log('Links with issue/task in href:');
for (const link of issueLinks.slice(0, 10)) {
  const href = await link.getAttribute('href').catch(() => 'N/A');
  const text = await link.textContent().catch(() => 'N/A');
  console.log('  Link:', href, '-', text?.trim());
}

await context.close();
console.log('Done');