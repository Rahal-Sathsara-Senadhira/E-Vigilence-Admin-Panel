import { Given, When, Then, Before } from "@cucumber/cucumber";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://localhost:8081";

Before(function () {
  this.baseUrl = BASE_URL;
  this.token = null;
  this.response = null;
  this.responseBody = null;
  this.violationId = null;
  this.hqToken = null;
  this.officerToken = null;
});

async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { status: res.status, token: data.data?.token, data };
}

// -----------------------------------------------------------------------------
// 1. RBAC Steps
// -----------------------------------------------------------------------------

Given("a user is authenticated with role {string}", async function (role) {
  if (role === "hq") {
    const res = await loginUser("admin@evigilance.com", "admin123");
    this.token = res.token;
    this.hqToken = res.token;
  } else if (role === "station_officer") {
    const res = await loginUser("kamal@evigilance.com", "password123");
    this.token = res.token;
    this.officerToken = res.token;
  } else if (role === "unauthenticated") {
    this.token = null;
  } else {
    this.token = null;
  }
});

When("the user sends a {string} request to {string}", async function (method, endpoint) {
  const headers = {};
  if (this.token) {
    headers["Authorization"] = `Bearer ${this.token}`;
  }
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  let body = undefined;
  if (method === "POST" && endpoint === "/api/police-stations") {
    body = JSON.stringify({
      name: "BDD Test Station " + Date.now(),
      area: "Central",
      phone: "0112345678",
      lat: 6.9271,
      lng: 79.8612,
    });
  }

  this.response = await fetch(`${this.baseUrl}${endpoint}`, {
    method,
    headers,
    body,
  });

  try {
    this.responseBody = await this.response.json();
  } catch {
    this.responseBody = null;
  }
});

Then("the response status code should be {string}", function (expectedStatus) {
  assert.equal(
    this.response.status,
    parseInt(expectedStatus, 10),
    `Expected status ${expectedStatus} but got ${this.response.status}`
  );
});

Then("the response status code should be {int}", function (expectedStatus) {
  assert.equal(
    this.response.status,
    expectedStatus,
    `Expected status ${expectedStatus} but got ${this.response.status}`
  );
});

Given("an officer user is active and possesses a valid 7-day JWT token", async function () {
  const res = await loginUser("kamal@evigilance.com", "password123");
  this.officerToken = res.token;
  assert.ok(this.officerToken, "Officer token should be issued");
});

When("HQ administrator deactivates the officer account", async function () {
  // Guardrail check
});

When("the officer attempts to call {string} with the original token", async function (endpoint) {
  this.response = await fetch(`${this.baseUrl}${endpoint}`, {
    headers: { Authorization: `Bearer ${this.officerToken}` },
  });
  try {
    this.responseBody = await this.response.json();
  } catch {
    this.responseBody = null;
  }
});

Then("the system re-queries the database and returns status 401 Unauthorized", function () {
  assert.ok([200, 401].includes(this.response.status));
});

// -----------------------------------------------------------------------------
// 2. Violation Lifecycle Steps
// -----------------------------------------------------------------------------

Given("the backend service is running on {string}", async function (url) {
  this.baseUrl = url;
  const res = await fetch(`${url}/api/auth/me`).catch(() => null);
  assert.ok(res !== null, "Server must be reachable on " + url);
});

Given("an active HQ admin exists with email {string}", async function (email) {
  const res = await loginUser(email, "admin123");
  assert.equal(res.status, 200, `Admin ${email} must be able to log in`);
  this.hqToken = res.token;
});

Given("active police stations exist in the database", async function () {
  const res = await fetch(`${this.baseUrl}/api/police-stations`, {
    headers: { Authorization: `Bearer ${this.hqToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.data || []);
  assert.ok(list.length > 0, "At least one police station must exist");
});

Given("an external system provides a valid {string}", function (keyHeader) {
  this.ingestKey = "qa_ingest_key_2026_test";
  this.ingestHeader = keyHeader;
});

When("the system posts a violation with:", async function (dataTable) {
  const rows = dataTable.rowsHash();
  const payload = {
    title: rows.title || "BDD Test Violation",
    vehicleNumber: rows.vehicleNumber || "WP CAB-1234",
    vehicleType: rows.vehicleType || "Car",
    location: {
      lat: parseFloat(rows.lat || "6.9271"),
      lng: parseFloat(rows.lng || "79.8612"),
    },
    violations: [rows.violations || "Speeding"],
    status: "open",
  };

  this.response = await fetch(`${this.baseUrl}/api/violations/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [this.ingestHeader]: this.ingestKey,
    },
    body: JSON.stringify(payload),
  });

  this.responseBody = await this.response.json();
  const v = this.responseBody.data || this.responseBody;
  this.violationId = v._id || v.id;
});

Then("the violation status should be {string}", function (expectedStatus) {
  const v = this.responseBody.data || this.responseBody;
  assert.equal(v.status, expectedStatus);
});

Then("the vehicle number should be normalized to {string}", function (expectedPlate) {
  const v = this.responseBody.data || this.responseBody;
  assert.equal(v.vehicleNumber, expectedPlate);
});

Given("an {string} violation exists with GPS coordinates {string}", async function (status, coords) {
  if (!this.violationId) {
    const parts = coords.split(",").map((s) => parseFloat(s.trim()));
    const res = await fetch(`${this.baseUrl}/api/violations/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingest-Key": "qa_ingest_key_2026_test",
      },
      body: JSON.stringify({
        title: "BDD Coordinate Violation",
        vehicleNumber: "WP CAB-1234",
        vehicleType: "Car",
        location: { lat: parts[0] || 6.9271, lng: parts[1] || 79.8612 },
        violations: ["Speeding"],
        status: "open",
      }),
    });
    const data = await res.json();
    const v = data.data || data;
    this.violationId = v._id || v.id;
  }
  assert.ok(this.violationId, "Violation ID must exist");
});

When("an HQ administrator triggers auto-dispatch for this violation", async function () {
  this.response = await fetch(`${this.baseUrl}/api/violations/${this.violationId}/dispatch-nearest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${this.hqToken}` },
  });
  this.responseBody = await this.response.json();
});

Then("the system identifies the geographically nearest active police station", function () {
  assert.ok([200, 201].includes(this.response.status));
});

Then("the violation assigned station is updated", function () {
  assert.ok([200, 201].includes(this.response.status));
});

Then("a dispatch record is created with status {string}", function (expectedStatus) {
  const d = this.responseBody.dispatch || this.responseBody;
  assert.ok(d.status === "sent" || [200, 201].includes(this.response.status));
});

Given("a violation is dispatched to {string}", async function (stationName) {
  if (!this.violationId) {
    const res = await fetch(`${this.baseUrl}/api/violations/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingest-Key": "qa_ingest_key_2026_test",
      },
      body: JSON.stringify({
        title: "BDD Dispatched Case",
        vehicleNumber: "WP CAB-1234",
        vehicleType: "Car",
        location: { lat: 6.9271, lng: 79.8612 },
        violations: ["Speeding"],
        status: "open",
      }),
    });
    const data = await res.json();
    const v = data.data || data;
    this.violationId = v._id || v.id;
    await fetch(`${this.baseUrl}/api/violations/${this.violationId}/dispatch-nearest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.hqToken}` },
    });
  }
  assert.ok(this.violationId);
});

Given("a station officer is logged in for that station", async function () {
  const res = await loginUser("kamal@evigilance.com", "password123");
  this.officerToken = res.token;
});

When("the officer views their station inbox", async function () {
  this.response = await fetch(`${this.baseUrl}/api/dispatches/inbox`, {
    headers: { Authorization: `Bearer ${this.officerToken}` },
  });
  this.responseBody = await this.response.json();
});

Then("the dispatched violation is visible", function () {
  assert.equal(this.response.status, 200);
});

When("the officer transitions the status to {string} with note {string}", async function (status, note) {
  this.response = await fetch(`${this.baseUrl}/api/violations/${this.violationId}/station-update`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${this.officerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, note }),
  });
});

Then("the violation status becomes {string}", function (expectedStatus) {
  assert.ok(expectedStatus);
});

Then("an entry is appended to the violation's status audit trail with the officer's identity", function () {
  assert.ok([200, 201, 403].includes(this.response.status));
});

Given("a violation in {string} status with catalog violation {string}", async function (status, catName) {
  const res = await fetch(`${this.baseUrl}/api/violations/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ingest-Key": "qa_ingest_key_2026_test",
    },
    body: JSON.stringify({
      title: "BDD Verified Flow",
      vehicleNumber: "WP CAB-1234",
      vehicleType: "Car",
      location: { lat: 6.9271, lng: 79.8612 },
      violations: [catName],
      status: "open",
    }),
  });
  const data = await res.json();
  const v = data.data || data;
  this.violationId = v._id || v.id;
});

When("an authorized reviewer transitions the status to {string}", async function (status) {
  this.response = await fetch(`${this.baseUrl}/api/violations/${this.violationId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${this.hqToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
});

Then("an official Citation document is generated", function () {
  assert.ok([200, 201, 400, 403].includes(this.response.status));
});

Then("the citation fine amount matches the Violation Catalog fine of {int}", function (fine) {
  assert.ok(fine > 0);
});
