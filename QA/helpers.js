// Shared bits for the QA tests.
const fs = require("node:fs");
const path = require("node:path");

/** The demo password: SEED_PASSWORD from New Backend/.env (never written here). */
function seedPassword() {
  if (process.env.SEED_PASSWORD) return process.env.SEED_PASSWORD;
  const env = fs.readFileSync(path.join(__dirname, "..", "New Backend", ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("SEED_PASSWORD="));
  if (!line) throw new Error("SEED_PASSWORD not found in New Backend/.env");
  return line.slice("SEED_PASSWORD=".length).replace(/^"|"$/g, "").trim();
}

const ACCOUNTS = {
  officer: { email: "officer.kandy@evigilance.local", serviceNo: "KD3002", name: "Demo Officer Kandy" },
  oic: { email: "oic.kandy@evigilance.local", serviceNo: "KD3001", name: "Demo OIC Kandy" },
  clerk: { email: "clerk.kandy@evigilance.local", serviceNo: "KD3003", name: "Demo Clerk Kandy" },
};

/** Saved sign-in for a role, made once by global-setup.js. */
const stateFile = (role) => path.join(__dirname, ".auth", `${role}.json`);

/** Fills the sign-in form. @param {import("@playwright/test").Page} page */
async function signIn(page, identifier, password = seedPassword()) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or service number").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

module.exports = { ACCOUNTS, seedPassword, signIn, stateFile };
