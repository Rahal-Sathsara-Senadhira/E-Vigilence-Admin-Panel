// Session 2 — signing in. Each test here signs in for real, so keep the count low.
const { test, expect } = require("@playwright/test");
const { ACCOUNTS, signIn } = require("../helpers.js");

const WRONG = "The email or service number, or the password, is not correct.";

test("SMK-03 / AUTH-01 an officer signs in with the service number", async ({ page }) => {
  await signIn(page, ACCOUNTS.officer.serviceNo);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(ACCOUNTS.officer.name).first()).toBeVisible();
});

test("AUTH-02 wrong password and unknown account get the same message", async ({ page }) => {
  await signIn(page, ACCOUNTS.officer.email, "WrongPass123");
  await expect(page.getByText(WRONG)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);

  await signIn(page, "nobody@evigilance.local", "WrongPass123");
  await expect(page.getByText(WRONG)).toBeVisible();

  // A correct sign-in resets the officer's failed-attempt counter.
  await signIn(page, ACCOUNTS.officer.email);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("AUTH-03 empty fields are refused with messages", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(/Enter your email or service number/i)).toBeVisible();
});

test("AUTH-06 a link opened while signed out asks to sign in, then opens it", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByLabel("Email or service number")).toBeVisible();
  await expect(page.getByText("TC-2026-")).toHaveCount(0);
  await page.getByLabel("Email or service number").fill(ACCOUNTS.officer.email);
  await page.getByLabel("Password", { exact: true }).fill(require("../helpers.js").seedPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/cases$/);
});
