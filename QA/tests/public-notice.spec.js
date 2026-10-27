// Session 5 — the public notice page reveals nothing without the right vehicle number.
const { test, expect } = require("@playwright/test");

const NOT_FOUND = "No notice matches that number and vehicle number. Check both and try again.";

async function lookUp(page, noticeNumber, plate) {
  await page.goto("/notice");
  await page.getByLabel("Notice number").fill(noticeNumber);
  await page.getByLabel("Vehicle number").fill(plate);
  await page.getByRole("button", { name: "Find my notice" }).click();
}

test("E2E-10 a real notice with the wrong vehicle number is not shown", async ({ page }) => {
  // PN-2026-000001 is the demo notice for CP CAR-4804.
  await lookUp(page, "PN-2026-000001", "CP CAB-9999");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await expect(page.getByText("Ruwan Jayasinghe")).toHaveCount(0);
});

test("E2E-10 a notice number that doesn't exist gets the same message", async ({ page }) => {
  await lookUp(page, "PN-2026-999999", "CP CAR-4804");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
});
