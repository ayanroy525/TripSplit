import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const rawConn = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "").replace(/\?.*$/, "");
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.AUTH_SECRET || "tripsplit_session_secret_dev";

function generateTestToken(userId: string, email: string = "", name: string = "Test"): string {
  const payload = {
    userId,
    email,
    name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };

  const headerBase64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`${headerBase64}.${payloadBase64}`)
    .digest("base64url");

  return `${headerBase64}.${payloadBase64}.${signature}`;
}

describe("Backend Authorization & IDOR Security Guard", () => {
  let pool: Pool;
  const baseUrl = "http://localhost:3000";

  beforeAll(async () => {
    if (rawConn) {
      pool = new Pool({ connectionString: rawConn, ssl: { rejectUnauthorized: false } });
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it("rejects unauthenticated request to /api/user-trips with 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/user-trips`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  it("rejects invalid token on /api/user-trips with 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/user-trips`, {
      headers: {
        Authorization: "Bearer invalid.fake.token",
      },
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("rejects unauthenticated request to /api/trips/:tripId with 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/trips/sample_trip_id_123`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  it("returns 403 Forbidden when a stranger attempts to read another user's trip via /api/trips/:tripId", async () => {
    // 1. Get an existing trip from DB
    if (!pool) return;
    const tripRes = await pool.query("SELECT id, owner_id FROM public.trips WHERE owner_id IS NOT NULL LIMIT 1;");
    if (tripRes.rows.length === 0) return;
    const trip = tripRes.rows[0];

    // 2. Generate a token for a completely unrelated stranger
    const strangerToken = generateTestToken("stranger_attacker_id_999", "stranger@example.com");

    const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
      headers: {
        Authorization: `Bearer ${strangerToken}`,
      },
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Access denied");
  });

  it("returns 200 OK when the trip owner accesses their trip via /api/trips/:tripId", async () => {
    if (!pool) return;
    const tripRes = await pool.query("SELECT id, owner_id FROM public.trips WHERE owner_id IS NOT NULL LIMIT 1;");
    if (tripRes.rows.length === 0) return;
    const trip = tripRes.rows[0];

    // Generate token for owner
    const ownerToken = generateTestToken(trip.owner_id, "owner@example.com");

    const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.trip).toBeDefined();
    expect(data.trip.id).toBe(trip.id);
  });

  it("derives user identity strictly from token in /api/user-trips (ignores spoofed userId query param)", async () => {
    if (!pool) return;
    const tripRes = await pool.query("SELECT id, owner_id FROM public.trips WHERE owner_id IS NOT NULL LIMIT 1;");
    if (tripRes.rows.length === 0) return;
    const trip = tripRes.rows[0];

    // Caller is a stranger attempting to pass ?userId=<victim_owner_id>
    const strangerToken = generateTestToken("stranger_attacker_id_888", "attacker@example.com");

    const res = await fetch(`${baseUrl}/api/user-trips?userId=${encodeURIComponent(trip.owner_id)}`, {
      headers: {
        Authorization: `Bearer ${strangerToken}`,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // The returned trips must NOT contain the victim's trip
    const foundVictimTrip = data.trips.find((t: any) => t.id === trip.id);
    expect(foundVictimTrip).toBeUndefined();
  });
});
