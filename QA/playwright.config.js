// Automated QA checks for the staff panel (New Frontend + New Backend).
// Runs against the app you already have running: panel on 5300, API on 4200.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  // The API allows 30 sign-ins per 15 minutes from one computer, so tests run
  // one at a time and each role signs in once (see global-setup.js).
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: require.resolve("./global-setup.js"),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5300",
    channel: "msedge", // the Edge already installed — no browser download
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
