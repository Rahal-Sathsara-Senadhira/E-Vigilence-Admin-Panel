import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:8081';

describe('TDD Suite — Authentication & Core Security', () => {
  let hqToken = '';
  let officerToken = '';

  test('RED/GREEN: 1. Unauthenticated request to /api/auth/me should return 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`);
    const data = await res.json();
    assert.equal(res.status, 401, 'Expected status 401 Unauthorized');
    assert.equal(data.message, 'Unauthorized');
  });

  test('RED/GREEN: 2. HQ Login should authenticate and issue valid JWT', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@evigilance.com', password: 'admin123' })
    });
    const body = await res.json();
    assert.equal(res.status, 200, 'Login failed');
    assert.ok(body.data?.token, 'Token must be present in response');
    assert.equal(body.data?.user?.role, 'hq', 'Role must be hq');
    hqToken = body.data.token;
  });

  test('RED/GREEN: 3. Officer Login should succeed with role station_officer', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'kamal@evigilance.com', password: 'password123' })
    });
    const body = await res.json();
    assert.equal(res.status, 200, 'Officer login failed');
    assert.equal(body.data?.user?.role, 'station_officer');
    officerToken = body.data.token;
  });

  test('RED/GREEN: 4. RBAC Guard: Station officer cannot access /api/users (returns 403)', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      headers: { 'Authorization': `Bearer ${officerToken}` }
    });
    assert.equal(res.status, 403, 'Expected 403 Forbidden for station officer on /api/users');
  });

  test('RED/GREEN: 5. RBAC Guard: HQ admin CAN access /api/users (returns 200)', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      headers: { 'Authorization': `Bearer ${hqToken}` }
    });
    assert.equal(res.status, 200, 'Expected 200 OK for HQ admin on /api/users');
    const body = await res.json();
    assert.ok(Array.isArray(body.data || body), 'Expected array of users');
  });
});

describe('TDD Suite — Violations & Catalog Workflow', () => {
  let hqToken = '';
  let createdViolationId = '';

  before(async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@evigilance.com', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    hqToken = loginData.data?.token;
  });

  test('RED/GREEN: 6. Fetch Violation Catalog list', async () => {
    const res = await fetch(`${BASE_URL}/api/violation-catalog`, {
      headers: { 'Authorization': `Bearer ${hqToken}` }
    });
    assert.equal(res.status, 200);
    const catalog = await res.json();
    const list = Array.isArray(catalog) ? catalog : (catalog.data || []);
    assert.ok(list.length > 0, 'Catalog should contain items');
  });

  test('RED/GREEN: 7. Ingest Violation via M2M Shared Key', async () => {
    const res = await fetch(`${BASE_URL}/api/violations/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ingest-Key': 'qa_ingest_key_2026_test'
      },
      body: JSON.stringify({
        title: 'TDD Auto Test — Speeding WP CAR-9988',
        violations: ['Speeding'],
        location: { lat: 6.9271, lng: 79.8612 },
        description: 'TDD integration test record',
        vehicleNumber: 'WP CAR-9988',
        vehicleType: 'Car',
        status: 'open'
      })
    });
    assert.ok([200, 201].includes(res.status), `Expected 200 or 201, got ${res.status}`);
    const data = await res.json();
    const v = data.data || data;
    assert.ok(v._id || v.id, 'Violation ID should be returned');
    assert.equal(v.status, 'open');
    createdViolationId = v._id || v.id;
  });

  test('RED/GREEN: 8. Read Ingested Violation by ID', async () => {
    assert.ok(createdViolationId, 'createdViolationId is required from step 7');
    const res = await fetch(`${BASE_URL}/api/violations/${createdViolationId}`, {
      headers: { 'Authorization': `Bearer ${hqToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const item = body.data || body;
    assert.equal(item._id || item.id, createdViolationId);
  });
});

describe('TDD Suite — Multi-User Login & Security Matrix', () => {
  const testMatrix = [
    {
      scenario: '1. HQ Admin Login (Valid Credentials)',
      email: 'admin@evigilance.com',
      password: 'admin123',
      expectedStatus: 200,
      expectedRole: 'hq'
    },
    {
      scenario: '2. Station Officer Login (Valid Credentials)',
      email: 'kamal@evigilance.com',
      password: 'password123',
      expectedStatus: 200,
      expectedRole: 'station_officer'
    },
    {
      scenario: '3. Case-Insensitive Email Login (UPPERCASE email)',
      email: 'ADMIN@EVIGILANCE.COM',
      password: 'admin123',
      expectedStatus: 200,
      expectedRole: 'hq'
    },
    {
      scenario: '4. Rejected: Wrong Password for HQ Admin',
      email: 'admin@evigilance.com',
      password: 'wrong_password_999',
      expectedStatus: 401,
      expectedMessage: 'Invalid credentials'
    },
    {
      scenario: '5. Rejected: Non-Existent User',
      email: 'ghost_user@police.gov.lk',
      password: 'anypassword',
      expectedStatus: 401,
      expectedMessage: 'Invalid credentials'
    },
    {
      scenario: '6. Rejected: Empty Password Field',
      email: 'admin@evigilance.com',
      password: '',
      expectedStatus: 400,
      expectedMessage: 'email and password are required'
    }
  ];

  for (const tc of testMatrix) {
    test(`DATA-DRIVEN: ${tc.scenario}`, async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: tc.email, password: tc.password })
      });

      const body = await res.json();
      assert.equal(res.status, tc.expectedStatus, `Status mismatch for scenario: ${tc.scenario}`);

      if (tc.expectedStatus === 200) {
        assert.ok(body.data?.token, 'Token should be returned');
        assert.equal(body.data?.user?.role, tc.expectedRole, `Role mismatch for ${tc.scenario}`);
      } else {
        assert.equal(body.message, tc.expectedMessage, `Error message mismatch for ${tc.scenario}`);
      }
    });
  }
});
