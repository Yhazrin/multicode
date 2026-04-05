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
 * Sets the auth cookie via same-origin fetch through the Next.js proxy,
 * then sets localStorage and navigates to /issues.
 */
export async function loginAsDefault(page: Page) {
  const { email, slug } = uniqueCredentials();

  // Step 1: Send verification code (server-side, retry on 429 rate limit)
  let sendOk = false;
  for (let attempt = 0; attempt < 3 && !sendOk; attempt++) {
    const sendRes = await fetch(`${API_BASE}/auth/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (sendRes.ok) {
      sendOk = true;
    } else if (sendRes.status === 429) {
      console.warn(`[helpers] send-code rate-limited for ${email}, attempt ${attempt + 1}/3`);
      await new Promise((r) => setTimeout(r, 11000));
    } else {
      const body = await sendRes.text();
      throw new Error(`send-code failed: ${sendRes.status} ${body}`);
    }
  }

  // Step 2: Verify using the master code (888888) via the Next.js proxy.
  // We navigate to /login first so page.evaluate has a same-origin context,
  // then use fetch("/auth/verify-code") (relative URL) which goes through
  // Next.js rewrites → API server. The Set-Cookie response header is set
  // on localhost:3000 (same origin as the frontend page).
  // NOTE: page.request.post to an absolute URL (http://localhost:8080/...)
  // would set the cookie on the API server domain, which the browser won't
  // send on subsequent page loads to localhost:3000.
  await page.goto("/login");
  const verifyResult = await page.evaluate(async ({ email }) => {
    const res = await fetch("/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: "888888" }),
      credentials: "include",
    });
    return res.json();
  }, { email });
  const token = verifyResult.token;

  if (!token) {
    throw new Error(`verify-code returned no token: ${JSON.stringify(verifyResult)}`);
  }

  // Update user name if needed
  if (verifyResult.user?.name !== DEFAULT_E2E_NAME) {
    await fetch(`${API_BASE}/api/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ name: DEFAULT_E2E_NAME }),
    });
  }

  // Step 3: Ensure workspace exists using the JWT token
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
  const wsListRes = await fetch(`${API_BASE}/api/workspaces`, { headers });
  const workspaces = await wsListRes.json();
  let workspace = workspaces.find((w: { slug: string }) => w.slug === slug) ?? workspaces[0];
  if (!workspace) {
    const createRes = await fetch(`${API_BASE}/api/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "E2E Workspace", slug }),
    });
    if (createRes.ok) {
      workspace = await createRes.json();
    } else {
      const refreshed = await fetch(`${API_BASE}/api/workspaces`, { headers }).then(r => r.json());
      workspace = refreshed.find((w: { slug: string }) => w.slug === slug) ?? refreshed[0];
    }
  }
  if (!workspace) throw new Error(`Failed to ensure workspace ${slug}`);

  // Set workspace ID in localStorage — we're on /login so localStorage is accessible
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
