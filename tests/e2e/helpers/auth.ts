/**
 * E2E test auth helper — authenticates via REST API and injects token into browser storage.
 *
 * Usage in tests:
 *   test('my test', async ({ page }) => {
 *     await loginAsSuperUser(page);
 *     await page.goto('/dashboard/business-partners');
 *     // ...
 *   });
 */
import type { Page } from "@playwright/test";

const API_BASE = "https://erpzk.sistematis.id/api/v1";

export async function loginAsSuperUser(page: Page) {
  // Step 1: Initial login
  const r1 = await fetch(`${API_BASE}/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName: "SuperUser", password: "System" }),
  });
  const d1 = await r1.json();

  // Step 2: Finalize session
  const r2 = await fetch(`${API_BASE}/auth/tokens`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${d1.token}`,
    },
    body: JSON.stringify({
      clientId: 11,
      roleId: 102,
      organizationId: 0,
      warehouseId: 50002,
      language: "en_US",
    }),
  });
  const d2 = await r2.json();

  // Inject token into browser storage — navigate to the app first to set origin
  await page.goto("/");
  await page.evaluate(
    ({ token, session }) => {
      localStorage.setItem("erp_token", JSON.stringify(token));
      localStorage.setItem("erp_session", JSON.stringify(session));
      localStorage.setItem("erp_remember", "true");
    },
    { token: d2.token, session: d2 },
  );
}
