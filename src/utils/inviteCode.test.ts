import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTripByInviteCode, joinTripByInviteCode } from "./storage";
import { supabase } from "./supabaseClient";
import { UserAccount } from "../types";

describe("Invite Code Lookup & Atomic Join System", () => {
  const mockUser: UserAccount = {
    id: "test_user_invite_999",
    name: "Test Traveler",
    email: "test.traveler@example.com",
    avatarColor: "#0F6B65",
    createdAt: new Date().toISOString(),
  };

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

  it("correctly looks up live trip 'Goa' with valid invite code 'TRIP-F25K4S'", async () => {
    const res = await getTripByInviteCode("TRIP-F25K4S");
    expect(res.success).toBe(true);
    expect(res.trip).toBeDefined();
    expect(res.trip?.title).toBe("Goa");
    expect(res.trip?.inviteCode).toBe("TRIP-F25K4S");
    expect(res.trip?.id).toBe("trip_goa_mucteofh");
    expect(res.trip?.members).toBeDefined();
    expect(res.trip?.members.length).toBeGreaterThan(0);
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
    const joinRes1 = await joinTripByInviteCode("TRIP-F25K4S", mockUser);
    expect(joinRes1.success).toBe(true);
    expect(joinRes1.trip?.id).toBe("trip_goa_mucteofh");

    // Joining again should be recognized as already a member without error
    const joinRes2 = await joinTripByInviteCode("TRIP-F25K4S", mockUser);
    expect(joinRes2.success).toBe(true);
    expect(joinRes2.alreadyMember).toBe(true);

    // Clean up test membership from DB after test
    await supabase.from("trip_members").delete().eq("user_id", mockUser.id);
  });
});
