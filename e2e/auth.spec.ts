import { test, expect } from "@playwright/test";
import { loginAsDefault } from "./helpers";

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

    // Open the workspace switcher dropdown
    await page.locator('[data-sidebar="header"] button').first().click();
    await page.locator('[role="menu"]').waitFor({ state: "visible", timeout: 5000 });

    // Click Log out — router.push("/") fires immediately
    await page.locator('[role="menuitem"]', { hasText: "Log out" }).click();

    // After logout, the page navigates to "/" (landing page)
    await page.waitForURL("**/", { timeout: 15000 });
  });
});
