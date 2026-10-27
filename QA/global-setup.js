// Signs in each station role once and saves the session, so the tests don't
// use up the API's sign-in limit (30 per 15 minutes).
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { ACCOUNTS, signIn, stateFile } = require("./helpers.js");

module.exports = async () => {
  fs.mkdirSync(path.join(__dirname, ".auth"), { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    for (const [role, account] of Object.entries(ACCOUNTS)) {
      const context = await browser.newContext({ baseURL: "http://localhost:5300" });
      const page = await context.newPage();
      await signIn(page, account.email);
      await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
        timeout: 15_000,
        waitUntil: "commit", // the panel changes page without reloading
      });
      await context.storageState({ path: stateFile(role) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
};
