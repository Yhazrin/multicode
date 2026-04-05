import { test, expect } from "@playwright/test";
import { loginAsDefault, openWorkspaceMenu } from "./helpers";

test.describe("Authentication", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator('input[placeholder="you@example.com"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText(
      "Continue",
    );
  });

  test("login and redirect to /issues", async ({ page }) => {
    await loginAsDefault(page);

    await expect(page).toHaveURL(/\/issues/);
  });

  test("unauthenticated user is redirected away from /issues", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.removeItem("multicode_token");
      localStorage.removeItem("multicode_workspace_id");
    });

    await page.goto("/issues");
    // Dashboard layout redirects unauthenticated users to "/" (landing page)
    await page.waitForURL("**/", { timeout: 10000 });
  });

  test("logout redirects to login", async ({ page }) => {
    await loginAsDefault(page);

    // Click the workspace switcher button (has ChevronDown icon)
    await page.locator('[data-sidebar="header"] button').first().click();
    await page.locator('[role="menu"]').waitFor({ state: "visible", timeout: 5000 });

    // Click Log out
    await page.locator("text=Log out").click();

    // After logout, the auth store clears and dashboard redirects to "/"
    await page.waitForURL("**/", { timeout: 10000 });
  });
});
