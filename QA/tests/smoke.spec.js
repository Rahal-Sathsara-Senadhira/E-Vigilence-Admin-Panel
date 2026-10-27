// Session 1 — is the app alive?
const { test, expect } = require("@playwright/test");

test("SMK-01 the backend answers", async ({ request }) => {
  const res = await request.get("http://localhost:4200/api/v1/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", database: "up" });
});

test("SMK-02 the panel opens on the sign-in page", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByLabel("Email or service number")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(errors).toEqual([]);
});
