// Connects each English line in sign-in.feature to a real API call.
const { When, Then } = require("@cucumber/cucumber");
const assert = require("node:assert");
const { seedPassword } = require("../../helpers.js");

const API = "http://localhost:4200/api/v1";

async function signIn(world, identifier, password) {
  const res = await fetch(`${API}/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "e-vigilance" },
    body: JSON.stringify({ identifier, password }),
  });
  world.status = res.status;
  world.body = await res.json();
}

When("I sign in as {string} with the correct password", async function (identifier) {
  await signIn(this, identifier, seedPassword());
});

When("I sign in as {string} with password {string}", async function (identifier, password) {
  await signIn(this, identifier, password);
});

Then("I get status {int}", function (status) {
  assert.strictEqual(this.status, status);
});

Then("I receive an access token", function () {
  assert.ok(this.body.session.accessToken, "no access token in the response");
});

Then("the message is {string}", function (message) {
  assert.strictEqual(this.body.error.message, message);
});

const { Given } = require("@cucumber/cucumber");

async function get(world, path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API}${path}`, { headers });
  world.status = res.status;
  world.body = await res.json();
}

When("I sign in with an empty form", async function () {
  await signIn(this, "", "");
});

When("I sign in as {string} without the security header", async function (identifier) {
  const res = await fetch(`${API}/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: seedPassword() }),
  });
  this.status = res.status;
});

Given("I am signed in as {string}", async function (identifier) {
  await signIn(this, identifier, seedPassword());
  assert.strictEqual(this.status, 200, `could not sign in as ${identifier}`);
  this.token = this.body.session.accessToken;
});

When("I open {string}", async function (path) {
  await get(this, path, this.token);
});

When("I open {string} without signing in", async function (path) {
  await get(this, path);
});

When("I open {string} with the token {string}", async function (path, token) {
  await get(this, path, token);
});

When("I look up notice {string} with vehicle {string}", async function (noticeNumber, plate) {
  const res = await fetch(`${API}/public/notices/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "e-vigilance" },
    body: JSON.stringify({ noticeNumber, plate }),
  });
  this.status = res.status;
  this.body = await res.json();
});
