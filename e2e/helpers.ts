import { type Page } from "@playwright/test";
import { TestApiClient } from "./fixtures";

const DEFAULT_E2E_NAME = "E2E User";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? "8080"}`;

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
 * Authenticates via API (send-code → DB read → verify-code), then sets
 * the HttpOnly auth cookie in the browser so the app's AuthInitializer
 * picks up the session.
 */
export async function loginAsDefault(page: Page) {
  const api = new TestApiClient();
  const { email, slug } = uniqueCredentials();
  const data = await api.login(email, DEFAULT_E2E_NAME);
  const workspace = await api.ensureWorkspace("E2E Workspace", slug);

  // Set the HttpOnly auth cookie in the browser context.
  // The app uses cookies (credentials: "include"), NOT localStorage tokens.
  // We call verify-code from the browser so the Set-Cookie header is processed.
  // We also need the code — get it from DB like fixtures do.
  const pg = await import("pg");
  const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://multicode:multicode@localhost:5432/multicode?sslmode=disable";
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try {
    const result = await client.query(
      "SELECT code FROM verification_code WHERE email = $1 AND used = FALSE AND expires_at > now() ORDER BY created_at DESC LIMIT 1",
      [email]
    );
    if (result.rows.length === 0) {
      throw new Error(`No verification code found for ${email}`);
    }
    const code = result.rows[0].code;

    // Call verify-code from the browser to get the Set-Cookie header
    await page.goto("/login");
    await page.evaluate(async ({ email, code, apiBase }) => {
      await fetch(`${apiBase}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
        credentials: "include",
      });
    }, { email, code, apiBase: API_BASE });
  } finally {
    await client.end();
  }

  // Set workspace ID in localStorage so AuthInitializer picks it up
  await page.evaluate((wsId) => {
    localStorage.setItem("multicode_workspace_id", wsId);
  }, workspace.id);

  // Now navigate — the cookie is set, AuthInitializer will authenticate
  await page.goto("/issues");
  await page.waitForURL("**/issues", { timeout: 15000 });
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
  // Click the workspace switcher button in the sidebar header
  await page.locator('[data-sidebar="header"] button').first().click();
  // Wait for dropdown to appear
  await page.locator('[role="menu"]').waitFor({ state: "visible", timeout: 5000 });
}
