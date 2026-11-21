import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTripByInviteCode, joinTripByInviteCode } from "./storage";
import { generateSessionToken, pool } from "../../api/_shared";
import { UserAccount } from "../types";

describe("Invite Code Lookup & Atomic Join System", () => {
  const mockUser: UserAccount = {
    id: "test_user_invite_999",
    name: "Test Traveler",
    email: "test.traveler@example.com",
    avatarColor: "#0F6B65",
    createdAt: new Date().toISOString(),
  };

  beforeAll(() => {
    const token = generateSessionToken(mockUser.id, mockUser.email, mockUser.name);
    (globalThis as any).__TRIPSPLIT_TEST_AUTH_TOKEN__ = token;
  });

  afterAll(async () => {
    delete (globalThis as any).__TRIPSPLIT_TEST_AUTH_TOKEN__;
    if (pool) {
      await pool.query("DELETE FROM public.trip_members WHERE user_id = $1;", [mockUser.id]).catch(() => {});
    }
  });

  it("handles empty or whitespace invite codes gracefully", async () => {
    const resEmpty = await getTripByInviteCode("");
    expect(resEmpty.success).toBe(false);
    expect(resEmpty.error).toContain("invite code");

    const resWhitespace = await getTripByInviteCode("   ");
    expect(resWhitespace.success).toBe(false);
  });

  it("handles join without user account gracefully", async () => {
    const res = await joinTripByInviteCode("TRIP-F25K4S", null as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain("log in");
  });

  it("correctly looks up live trip 'Goa' with valid invite code 'TRIP-F25K4S' without leaking member IDs", async () => {
    const res = await getTripByInviteCode("TRIP-F25K4S");
    expect(res.success).toBe(true);
    expect(res.trip).toBeDefined();
    expect(res.trip?.title).toBe("Goa");
    expect(typeof res.trip?.memberCount).toBe("number");
    expect(res.trip?.memberCount).toBeGreaterThan(0);
    expect(res.trip?.ownerId).toBeUndefined();
    expect(res.trip?.memberUserIds).toBeUndefined();
    expect(res.trip?.members).toBeUndefined();
  });

  it("normalizes case and whitespace when looking up '  trip-f25k4s  '", async () => {
    const res = await getTripByInviteCode("  trip-f25k4s  ");
    expect(res.success).toBe(true);
    expect(res.trip?.title).toBe("Goa");
  });

  it("returns clear invalid error message for non-existent code", async () => {
    const res = await getTripByInviteCode("TRIP-NONEXISTENT-999");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid or expired/i);
  });

  it("atomically joins the trip and prevents duplicate membership (idempotency)", async () => {
    if (pool) {
      await pool.query("DELETE FROM public.trip_members WHERE user_id = $1;", [mockUser.id]).catch(() => {});
    }
    const joinRes1 = await joinTripByInviteCode("TRIP-F25K4S", mockUser);
    expect(joinRes1.success).toBe(true);
    expect(joinRes1.trip?.id).toBe("trip_goa_mucteofh");

    // Joining again should be recognized as already a member without error
    const joinRes2 = await joinTripByInviteCode("TRIP-F25K4S", mockUser);
    expect(joinRes2.success).toBe(true);
    expect(joinRes2.alreadyMember).toBe(true);

    // Clean up test membership via server pg pool
    if (pool) {
      await pool.query("DELETE FROM public.trip_members WHERE user_id = $1;", [mockUser.id]).catch(() => {});
    }
  });
});
