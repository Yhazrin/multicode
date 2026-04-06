import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Navigate to issues page
await page.goto('http://localhost:3000/issues');
await page.waitForTimeout(3000);

console.log('Current URL:', page.url());
console.log('Waiting for page to fully load...');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
console.log('URL after load:', page.url());

console.log('URL after navigation:', page.url());

// Look for create issue button
const newIssueButton = page.locator('button:has-text("New Issue"), button:has-text("Create Issue"), button:has-text("New"), [data-testid*="new-issue"]').first();
const buttonExists = await newIssueButton.isVisible().catch(() => false);
console.log('New Issue button visible:', buttonExists);

if (buttonExists) {
  await newIssueButton.click();
  await page.waitForTimeout(2000);
  console.log('URL after click:', page.url());

  // Try to find and fill title input
  const titleInput = page.locator('input[name="title"], input[placeholder*="title" i], input[placeholder*="Issue" i]').first();
  const titleExists = await titleInput.isVisible().catch(() => false);
  console.log('Title input visible:', titleExists);

  if (titleExists) {
    await titleInput.fill('让 Agent 自动拆解任务');
    console.log('Filled title');

    // Try to find and fill description
    const descInput = page.locator('textarea[name="description"], textarea[placeholder*="description" i], [role="textbox"]').first();
    const descExists = await descInput.isVisible().catch(() => false);
    console.log('Description input visible:', descExists);

    if (descExists) {
      await descInput.fill('测试 agents 协同工作：拆解一个复杂任务，让不同 agent 各司其职。创建一个需要多个步骤才能完成的任务，例如：调研竞品并输出对比报告。');
      console.log('Filled description');
    }

    // Look for submit button
    const submitButton = page.locator('button:has-text("Create"), button:has-text("Submit"), button:has-text("Save")').first();
    const submitExists = await submitButton.isVisible().catch(() => false);
    console.log('Submit button visible:', submitExists);

    if (submitExists) {
      await submitButton.click();
      await page.waitForTimeout(3000);
      console.log('URL after submit:', page.url());
    }
  }
} else {
  // Dump page content for debugging
  const content = await page.content();
  console.log('Page content (first 2000 chars):', content.substring(0, 2000));
}

await browser.close();
console.log('Done');