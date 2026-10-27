// Session 4 — the report form refuses bad input. Nothing here is saved:
// every case leaves at least one field wrong.
const { test, expect } = require("@playwright/test");
const { stateFile } = require("../helpers.js");

test.use({ storageState: stateFile("clerk") });

test.beforeEach(async ({ page }) => {
  await page.goto("/reports/new");
  await expect(page.getByRole("button", { name: "Record report" })).toBeVisible();
});

const submit = (page) => page.getByRole("button", { name: "Record report" }).click();

test("REP-02 a plate that isn't Sri Lankan", async ({ page }) => {
  await page.getByLabel("Plate").fill("ABC123");
  await submit(page);
  await expect(page.getByText("Enter a Sri Lankan plate, e.g. WP CAB-1234.")).toBeVisible();
});

test("REP-05 no plate and plate unknown not ticked", async ({ page }) => {
  await submit(page);
  await expect(page.getByText(/Enter the plate, or tick/)).toBeVisible();
});

test("REP-06 no offence chosen", async ({ page }) => {
  await submit(page);
  await expect(page.getByText("Choose at least one offence.")).toBeVisible();
});

test("REP-07a a 9-character description is too short", async ({ page }) => {
  await page.getByLabel("Description").fill("Bad drive");
  await submit(page);
  await expect(page.getByText(/Describe what happened \(10 characters or more\)/)).toBeVisible();
});

test("REP-07b a 10-character description is long enough", async ({ page }) => {
  await page.getByLabel("Description").fill("Bad drive!");
  await submit(page);
  await expect(page.getByText("Choose at least one offence.")).toBeVisible(); // the form did validate
  await expect(page.getByText(/Describe what happened/)).toHaveCount(0);
});

test("REP-08 a time in the future", async ({ page }) => {
  const tomorrow = new Date(Date.now() + 86_400_000 - new Date().getTimezoneOffset() * 60_000);
  await page.getByLabel("When").fill(tomorrow.toISOString().slice(0, 16));
  await submit(page);
  await expect(page.getByText("This is in the future.")).toBeVisible();
});

test("REP-09a older than 30 days", async ({ page }) => {
  const old = new Date(Date.now() - 31 * 86_400_000 - new Date().getTimezoneOffset() * 60_000);
  await page.getByLabel("When").fill(old.toISOString().slice(0, 16));
  await submit(page);
  await expect(page.getByText("Reports must be within the last 30 days.")).toBeVisible();
});

test("REP-11 a wrong phone number", async ({ page }) => {
  await page.getByLabel("Reporter's name").fill("Nimal Perera");
  await page.getByLabel("Phone (optional)").fill("12345");
  await submit(page);
  await expect(page.getByText("Enter a Sri Lankan phone number.")).toBeVisible();
});
