// Session 3 — who can see what (docs/20 §5). Uses the sessions saved by global-setup.js.
const { test, expect } = require("@playwright/test");
const { stateFile } = require("../helpers.js");

/** The menu's links, by name. @param {import("@playwright/test").Page} page */
async function menu(page) {
  const nav = page.getByRole("navigation").first();
  await expect(nav.getByRole("link").first()).toBeVisible();
  return nav.getByRole("link").allInnerTexts().then((t) => t.map((s) => s.trim()).filter(Boolean));
}

const MENUS = {
  clerk: {
    has: ["Inbox", "My work", "Reports", "Cases", "Penalty notices", "Court", "Payments", "Overdue", "Offence schedule"],
    not: ["Audit log", "Station staff", "Accounts", "Management reports", "Rewards", "Time limits", "System health"],
  },
  officer: {
    has: ["Inbox", "My work", "Reports", "Cases", "Penalty notices", "Court", "Overdue", "Offence schedule"],
    not: ["Payments", "Audit log", "Station staff", "Accounts", "Management reports", "Rewards"],
  },
  oic: {
    has: [
      "Inbox", "My station", "Reports", "Cases", "Penalty notices", "Court", "Payments", "Overdue",
      "Management reports", "Audit log", "Station staff", "Station profile", "Offence schedule",
    ],
    not: ["Rewards", "Time limits", "Courts", "System health", "System settings", "Data retention"],
  },
};

const IDS = { clerk: "ROLE-01", officer: "ROLE-02", oic: "ROLE-03" };

for (const [role, expected] of Object.entries(MENUS)) {
  test.describe(`${IDS[role]} ${role} menu`, () => {
    test.use({ storageState: stateFile(role) });
    test(`${IDS[role]} the ${role} sees exactly their menu`, async ({ page }) => {
      await page.goto("/");
      const items = await menu(page);
      for (const name of expected.has) expect(items, `should show ${name}`).toContain(name);
      for (const name of expected.not) expect(items, `must not show ${name}`).not.toContain(name);
    });
  });
}

test.describe("ROLE-04 typed addresses", () => {
  test.use({ storageState: stateFile("officer") });
  for (const url of ["/audit", "/accounts", "/payments", "/settings/time-limits", "/system", "/rewards"]) {
    test(`ROLE-04 the officer can't open ${url}`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    });
  }
});
