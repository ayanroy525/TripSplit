/**
 * TripSplit Auth Endpoint Test Script
 * Run with: npx tsx test-auth.ts
 */

const BASE_URL = process.env.API_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  status: "PASS" | "FAIL";
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`[TEST] ${message}`);
}

function pass(name: string, details?: any) {
  results.push({ name, status: "PASS", details });
  log(`✓ ${name}`);
}

function fail(name: string, error: string, details?: any) {
  results.push({ name, status: "FAIL", error, details });
  log(`✗ ${name}: ${error}`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(
  method: string,
  endpoint: string,
  body?: any,
  token?: string
) {
  const url = `${BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return {
      status: response.status,
      ok: response.ok,
      data,
    };
  } catch (err: any) {
    throw new Error(`Request failed: ${err.message}`);
  }
}

async function testHealthCheck() {
  try {
    const res = await request("GET", "/api/health");
    if (res.status === 200) {
      pass("Health check", res.data);
    } else {
      fail("Health check", `Expected 200, got ${res.status}`, res.data);
    }
  } catch (err: any) {
    fail("Health check", err.message);
  }
}

async function testSignup(email: string, password: string) {
  try {
    const res = await request("POST", "/api/auth/signup", {
      name: "Test User",
      email,
      phone: "+1234567890",
      password,
      avatarColor: "#0F6B65",
      bio: "Test Account",
    });

    if (res.status === 200 && res.data.success && res.data.token) {
      pass("Signup - Creates user and returns token", {
        userId: res.data.user?.id,
        email: res.data.user?.email,
        hasToken: !!res.data.token,
      });
      return res.data.token;
    } else if (res.status === 409) {
      pass("Signup - User already exists (expected on retry)", res.data);
      return null;
    } else {
      fail(
        "Signup - Create user",
        `Expected 200, got ${res.status}`,
        res.data
      );
      return null;
    }
  } catch (err: any) {
    fail("Signup - Create user", err.message);
    return null;
  }
}

async function testLogin(email: string, password: string) {
  try {
    const res = await request("POST", "/api/auth/login", {
      emailOrPhone: email,
      password,
    });

    if (res.status === 200 && res.data.success && res.data.token) {
      pass("Login - Returns token for valid credentials", {
        userId: res.data.user?.id,
        email: res.data.user?.email,
        hasToken: !!res.data.token,
      });
      return res.data.token;
    } else if (res.status === 404) {
      fail(
        "Login - Valid credentials",
        "User not found (ensure signup succeeded)",
        res.data
      );
      return null;
    } else {
      fail(
        "Login - Valid credentials",
        `Expected 200, got ${res.status}`,
        res.data
      );
      return null;
    }
  } catch (err: any) {
    fail("Login - Valid credentials", err.message);
    return null;
  }
}

async function testLoginInvalidPassword(email: string) {
  try {
    const res = await request("POST", "/api/auth/login", {
      emailOrPhone: email,
      password: "wrongpassword123",
    });

    if (res.status === 401) {
      pass("Login - Rejects invalid password (401)", res.data);
    } else {
      fail(
        "Login - Rejects invalid password",
        `Expected 401, got ${res.status}`,
        res.data
      );
    }
  } catch (err: any) {
    fail("Login - Rejects invalid password", err.message);
  }
}

async function testUserTripsWithoutToken() {
  try {
    const res = await request("GET", "/api/user-trips");

    if (res.status === 401) {
      pass("Protected endpoint - Rejects request without token (401)", res.data);
    } else {
      fail(
        "Protected endpoint - Rejects request without token",
        `Expected 401, got ${res.status}`,
        res.data
      );
    }
  } catch (err: any) {
    fail(
      "Protected endpoint - Rejects request without token",
      err.message
    );
  }
}

async function testUserTripsWithInvalidToken() {
  try {
    const res = await request(
      "GET",
      "/api/user-trips",
      undefined,
      "invalid.token.here"
    );

    if (res.status === 401) {
      pass(
        "Protected endpoint - Rejects invalid token (401)",
        res.data
      );
    } else {
      fail(
        "Protected endpoint - Rejects invalid token",
        `Expected 401, got ${res.status}`,
        res.data
      );
    }
  } catch (err: any) {
    fail("Protected endpoint - Rejects invalid token", err.message);
  }
}

async function testUserTripsWithValidToken(token: string) {
  try {
    const res = await request("GET", "/api/user-trips", undefined, token);

    if (res.status === 200 && res.data.success) {
      pass(
        "Protected endpoint - Returns data with valid token (200)",
        {
          tripsCount: res.data.trips?.length || 0,
        }
      );
    } else {
      fail(
        "Protected endpoint - Returns data with valid token",
        `Expected 200, got ${res.status}`,
        res.data
      );
    }
  } catch (err: any) {
    fail(
      "Protected endpoint - Returns data with valid token",
      err.message
    );
  }
}

async function testSingleTripWithoutToken() {
  try {
    const res = await request("GET", "/api/trips/nonexistent-trip-id");

    if (res.status === 401) {
      pass(
        "Single trip endpoint - Rejects request without token (401)",
        res.data
      );
    } else {
      fail(
        "Single trip endpoint - Rejects request without token",
        `Expected 401, got ${res.status}`,
        res.data
      );
    }
  } catch (err: any) {
    fail(
      "Single trip endpoint - Rejects request without token",
      err.message
    );
  }
}

async function testSingleTripWithValidToken(token: string) {
  try {
    const res = await request(
      "GET",
      "/api/trips/nonexistent-trip-id",
      undefined,
      token
    );

    if (res.status === 404) {
      pass(
        "Single trip endpoint - Token accepted, trip not found (404)",
        res.data
      );
    } else if (res.status === 403) {
      pass(
        "Single trip endpoint - Token accepted, access denied (403)",
        res.data
      );
    } else if (res.status === 401) {
      fail(
        "Single trip endpoint - Token accepted",
        "Token was rejected (401) - token validation failed",
        res.data
      );
    } else {
      fail(
        "Single trip endpoint - Token accepted",
        `Expected 404/403, got ${res.status}`,
        res.data
      );
    }
  } catch (err: any) {
    fail("Single trip endpoint - Token accepted", err.message);
  }
}

async function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const total = results.length;

  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}\n`);

  results.forEach((r) => {
    const icon = r.status === "PASS" ? "✓" : "✗";
    console.log(`${icon} ${r.name}`);
    if (r.error) {
      console.log(`  Error: ${r.error}`);
    }
    if (r.details) {
      console.log(`  Details: ${JSON.stringify(r.details)}`);
    }
  });

  console.log("\n" + "=".repeat(60));
  if (failed === 0) {
    console.log("✓ All tests passed!");
  } else {
    console.log(`✗ ${failed} test(s) failed`);
  }
  console.log("=".repeat(60) + "\n");

  process.exit(failed === 0 ? 0 : 1);
}

async function main() {
  console.log(`\n🧪 TripSplit Auth Endpoint Tests`);
  console.log(`Base URL: ${BASE_URL}\n`);

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "SecurePassword123!";

  // Test 1: Health check
  await testHealthCheck();
  await delay(500);

  // Test 2: Signup
  log("Testing signup endpoint...");
  let signupToken = await testSignup(testEmail, testPassword);
  await delay(500);

  // Test 3: Login
  log("Testing login endpoint...");
  let loginToken = await testLogin(testEmail, testPassword);
  await delay(500);

  // Test 4: Login with invalid password
  log("Testing login with invalid password...");
  await testLoginInvalidPassword(testEmail);
  await delay(500);

  // Test 5: Protected endpoint without token
  log("Testing protected endpoints without token...");
  await testUserTripsWithoutToken();
  await delay(500);

  // Test 6: Protected endpoint with invalid token
  log("Testing protected endpoints with invalid token...");
  await testUserTripsWithInvalidToken();
  await delay(500);

  // Test 7: Protected endpoint with valid token (use login token)
  if (loginToken) {
    log("Testing protected endpoints with valid token...");
    await testUserTripsWithValidToken(loginToken);
    await delay(500);
  }

  // Test 8: Single trip endpoint without token
  log("Testing single trip endpoint without token...");
  await testSingleTripWithoutToken();
  await delay(500);

  // Test 9: Single trip endpoint with valid token
  if (loginToken) {
    log("Testing single trip endpoint with valid token...");
    await testSingleTripWithValidToken(loginToken);
    await delay(500);
  }

  // Print summary
  await printSummary();
}

main().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
