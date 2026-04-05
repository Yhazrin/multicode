import { type Page } from "@playwright/test";
import { TestApiClient } from "./fixtures";

const DEFAULT_E2E_NAME = "E2E User";

// Each call gets a unique email to avoid the server's 10s/email rate limit
// on /auth/send-code.  Combining pid + timestamp + counter ensures uniqueness
// across parallel Playwright workers (separate processes) and sequential calls.
let counter = 0;
function uniqueCredentials() {
  const n = `${process.pid}-${Date.now()}-${counter++}`;
  return {
    email: `e2e+${n}@multicode.ai`,
    slug: `ws-${n}`,
  };
}

/**
 * Log in as the default E2E user and ensure the workspace exists first.
 * Authenticates via API (send-code → DB read → verify-code), then injects
 * the token into localStorage so the browser session is authenticated.
 */
export async function loginAsDefault(page: Page) {
  const api = new TestApiClient();
  const { email, slug } = uniqueCredentials();
  await api.login(email, DEFAULT_E2E_NAME);
  await api.ensureWorkspace("E2E Workspace", slug);

  const token = api.getToken();
  await page.goto("/login");
  await page.evaluate((t) => {
    localStorage.setItem("multicode_token", t);
  }, token);
  await page.goto("/issues");
  await page.waitForURL("**/issues", { timeout: 10000 });
}

/**
 * Create a TestApiClient logged in as the default E2E user.
 * Call api.cleanup() in afterEach to remove test data created during the test.
 */
export async function createTestApi(): Promise<TestApiClient> {
  const api = new TestApiClient();
  const { email, slug } = uniqueCredentials();
  await api.login(email, DEFAULT_E2E_NAME);
  await api.ensureWorkspace("E2E Workspace", slug);
  return api;
}

export async function openWorkspaceMenu(page: Page) {
  // Click the workspace switcher button (has ChevronDown icon)
  await page.locator("aside button").first().click();
  // Wait for dropdown to appear
  await page.locator('[class*="popover"]').waitFor({ state: "visible" });
}
