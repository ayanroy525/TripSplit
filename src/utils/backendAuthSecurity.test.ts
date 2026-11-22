import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

import { getSessionSecret } from "../../api/_shared";

const rawConn = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "").replace(/\?.*$/, "");
const SESSION_SECRET = getSessionSecret();

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

  it("rejects unauthenticated requests to all admin, cron, telegram, sync, and unknown API endpoints with 401", async () => {
    const protectedEndpoints = [
      { method: "GET", path: "/api/db/status" },
      { method: "GET", path: "/api/health/history" },
      { method: "POST", path: "/api/health/run-check" },
      { method: "GET", path: "/api/cron/daily-check" },
      { method: "GET", path: "/api/telegram/settings" },
      { method: "POST", path: "/api/telegram/settings" },
      { method: "POST", path: "/api/telegram/test" },
      { method: "GET", path: "/api/telegram/detect-chat" },
      { method: "GET", path: "/api/telegram/webhook" },
      { method: "GET", path: "/api/download-audit-pdf" },
      { method: "POST", path: "/api/sync/mutation" },
      { method: "POST", path: "/api/auth/revoke-all-sessions" },
      { method: "GET", path: "/api/unknown-nonexistent-endpoint" },
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, { method: ep.method });
      expect(res.status, `Expected 401 on ${ep.method} ${ep.path}`).toBe(401);
    }
  });

  it("rejects spoofed X-Admin-Email header without a valid signed Bearer token with 401", async () => {
    const res = await fetch(`${baseUrl}/api/db/status`, {
      headers: {
        "X-Admin-Email": "ayanroy525@gmail.com",
      },
    });
    expect(res.status).toBe(401);
  });

  it("rejects authenticated non-admin user from accessing admin and diagnostic endpoints with 403", async () => {
    const nonAdminToken = generateTestToken("regular_user_123", "regular.traveler@example.com", "Regular User");
    const adminEndpoints = [
      { method: "GET", path: "/api/db/status" },
      { method: "GET", path: "/api/health/history" },
      { method: "POST", path: "/api/health/run-check" },
      { method: "GET", path: "/api/cron/daily-check" },
      { method: "GET", path: "/api/telegram/settings" },
      { method: "POST", path: "/api/telegram/settings" },
      { method: "POST", path: "/api/telegram/test" },
      { method: "GET", path: "/api/telegram/detect-chat" },
      { method: "GET", path: "/api/telegram/webhook" },
    ];

    for (const ep of adminEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${nonAdminToken}`,
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      expect(res.status, `Expected 403 on ${ep.method} ${ep.path} for non-admin`).toBe(403);
    }
  });

  it("allows authenticated admin (ayanroy525@gmail.com) to access /api/db/status and /api/health/history", async () => {
    const adminToken = generateTestToken("admin_user_id", "ayanroy525@gmail.com", "Ayan Roy");

    const dbRes = await fetch(`${baseUrl}/api/db/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(dbRes.status).toBe(200);

    const histRes = await fetch(`${baseUrl}/api/health/history`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(histRes.status).toBe(200);
  });

  it("blocks SAVE_TRIP_SNAPSHOT privilege escalation on an existing trip by a non-member", async () => {
    if (!pool) return;
    const tripRes = await pool.query("SELECT id, owner_id FROM public.trips WHERE owner_id IS NOT NULL LIMIT 1;");
    if (tripRes.rows.length === 0) return;
    const trip = tripRes.rows[0];

    const attackerId = "attacker_snapshot_hijack_999";
    const attackerToken = generateTestToken(attackerId, "attacker@example.com");

    const res = await fetch(`${baseUrl}/api/sync/mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Authorization: `Bearer ${attackerToken}`,
      },
      body: JSON.stringify({
        type: "SAVE_TRIP_SNAPSHOT",
        tripId: trip.id,
        payload: {
          id: trip.id,
          title: "Hijacked Trip",
          ownerId: attackerId, // Attacker spoofing ownerId to match their own userId!
          memberUserIds: [attackerId],
        },
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("prevents looking up or joining a trip by internal trip ID instead of secret invite code", async () => {
    if (!pool) return;
    const tripRes = await pool.query("SELECT id FROM public.trips LIMIT 1;");
    if (tripRes.rows.length === 0) return;
    const tripId = tripRes.rows[0].id;

    const lookupRes = await fetch(`${baseUrl}/api/trips/invite/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ inviteCode: tripId }),
    });
    expect([400, 404]).toContain(lookupRes.status);
  });

  it("enforces participant RBAC and persists nested members and itemized expenses in /api/sync/mutation", async () => {
    if (!pool) return;
    const testTripId = `trip_audit_rbac_${Date.now()}`;
    const ownerId = `u_audit_owner_${Date.now()}`;
    const partId = `u_audit_part_${Date.now()}`;
    const ownerToken = generateTestToken(ownerId, "owner@audit.app", "Owner");
    const partToken = generateTestToken(partId, "part@audit.app", "Participant");

    try {
      // 1. Owner creates trip via SAVE_TRIP_SNAPSHOT with nested members
      const snapRes = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          type: "SAVE_TRIP_SNAPSHOT",
          tripId: testTripId,
          payload: {
            id: testTripId,
            title: "Audit RBAC Trip",
            ownerId,
            ownerName: "Owner",
            currency: "INR",
            members: [
              { id: `m_${ownerId}`, userId: ownerId, name: "Owner", role: "admin", avatarColor: "#0F6B65" },
              { id: `m_${partId}`, userId: partId, name: "Participant", role: "participant", avatarColor: "#E39A2D" },
            ],
          },
        }),
      });
      expect(snapRes.status).toBe(200);

      // Verify nested members were persisted
      const memCheck = await pool.query("SELECT id, role FROM public.trip_members WHERE trip_id = $1;", [testTripId]);
      expect(memCheck.rows.length).toBe(2);

      // 2. Owner saves an itemized expense with auditLogs
      const expId = `exp_audit_${Date.now()}`;
      const expRes = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          type: "SAVE_EXPENSE",
          tripId: testTripId,
          payload: {
            id: expId,
            title: "Itemized Lunch",
            amount: 1000,
            paidBy: `m_${ownerId}`,
            createdBy: ownerId,
            method: "itemized",
            splitType: "itemized",
            participants: [`m_${ownerId}`, `m_${partId}`],
            splits: { [`m_${ownerId}`]: 600, [`m_${partId}`]: 400 },
            items: [{ id: "item_1", name: "Thali", amount: 1000, assignedTo: [`m_${ownerId}`, `m_${partId}`] }],
            auditLogs: [{ id: "log_1", ts: "Now", user: "Owner", action: "created" }],
          },
        }),
      });
      expect(expRes.status).toBe(200);

      const expDb = await pool.query("SELECT items, audit_logs FROM public.expenses WHERE id = $1;", [expId]);
      expect(Array.isArray(expDb.rows[0]?.items)).toBe(true);
      expect(expDb.rows[0].items.length).toBe(1);
      expect(Array.isArray(expDb.rows[0]?.audit_logs)).toBe(true);

      // 3. Participant CANNOT delete a member (403)
      const delMemRes = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: `Bearer ${partToken}`,
        },
        body: JSON.stringify({
          type: "DELETE_MEMBER",
          tripId: testTripId,
          payload: { memberId: `m_${ownerId}` },
        }),
      });
      expect(delMemRes.status).toBe(403);

      // 4. Participant CANNOT promote themselves to admin (403)
      const promoteRes = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: `Bearer ${partToken}`,
        },
        body: JSON.stringify({
          type: "SAVE_MEMBER",
          tripId: testTripId,
          payload: { id: `m_${partId}`, userId: partId, name: "Participant", role: "admin" },
        }),
      });
      expect(promoteRes.status).toBe(403);

      // 5. Participant CANNOT edit or delete Owner's expense (403)
      const editOtherExpRes = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: `Bearer ${partToken}`,
        },
        body: JSON.stringify({
          type: "SAVE_EXPENSE",
          tripId: testTripId,
          payload: { id: expId, title: "Tampered Title", amount: 1000 },
        }),
      });
      expect(editOtherExpRes.status).toBe(403);

      const delOtherExpRes = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: `Bearer ${partToken}`,
        },
        body: JSON.stringify({
          type: "DELETE_EXPENSE",
          tripId: testTripId,
          payload: { expenseId: expId },
        }),
      });
      expect(delOtherExpRes.status).toBe(403);
    } finally {
      await pool.query("DELETE FROM public.trips WHERE id = $1;", [testTripId]);
    }
  });

  it("rejects unauthenticated /api/auth/update-password requests even when email is supplied in request body", async () => {
    const res = await fetch(`${baseUrl}/api/auth/update-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        action: "update-password",
        email: "ayanroy525@gmail.com",
        newPassword: "AttackerAttemptPassword123!",
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.token).toBeUndefined();
  });
});
