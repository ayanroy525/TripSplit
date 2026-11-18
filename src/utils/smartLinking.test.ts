import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPhoneMatch, isEmailMatch, linkUserToExistingTripMembers, addMemberToDatabase } from "./storage";
import { UserAccount, Member } from "../types";

describe("Smart User-Member Linking Test Suite", () => {
  describe("1. Phone Number Normalization & Matching (isPhoneMatch)", () => {
    it("matches exact 10-digit mobile numbers", () => {
      expect(isPhoneMatch("9062069475", "9062069475")).toBe(true);
    });

    it("matches international format (+91) with national format", () => {
      expect(isPhoneMatch("+91 9062069475", "9062069475")).toBe(true);
      expect(isPhoneMatch("9062069475", "+919062069475")).toBe(true);
    });

    it("matches formatted phones with dashes, spaces, and brackets", () => {
      expect(isPhoneMatch("+91-90620-69475", "+91 90620 69475")).toBe(true);
      expect(isPhoneMatch("+1 (555) 234-5678", "5552345678")).toBe(true);
    });

    it("matches national trunk prefix (0) with country code (+91)", () => {
      expect(isPhoneMatch("09062069475", "+919062069475")).toBe(true);
      expect(isPhoneMatch("+919062069475", "09062069475")).toBe(true);
    });

    it("does not match different phone numbers", () => {
      expect(isPhoneMatch("9062069475", "9062069476")).toBe(false);
      expect(isPhoneMatch("+919062069475", "+919876543210")).toBe(false);
    });

    it("rejects phone numbers shorter than 7 digits to prevent false positives", () => {
      expect(isPhoneMatch("12345", "12345")).toBe(false);
      expect(isPhoneMatch("999", "999")).toBe(false);
    });

    it("gracefully handles null, undefined, or empty phone numbers", () => {
      expect(isPhoneMatch(null, "9062069475")).toBe(false);
      expect(isPhoneMatch("9062069475", undefined)).toBe(false);
      expect(isPhoneMatch("", "")).toBe(false);
    });
  });

  describe("2. Email Normalization & Matching (isEmailMatch)", () => {
    it("matches exact emails", () => {
      expect(isEmailMatch("traveler@example.com", "traveler@example.com")).toBe(true);
    });

    it("matches case-insensitively", () => {
      expect(isEmailMatch("AyanRoy525@GMAIL.COM", "ayanroy525@gmail.com")).toBe(true);
      expect(isEmailMatch("Sneha.Travel@Domain.Org", "sneha.travel@domain.org")).toBe(true);
    });

    it("trims whitespace before matching", () => {
      expect(isEmailMatch("  ayanroy525@gmail.com  ", "ayanroy525@gmail.com")).toBe(true);
    });

    it("does not match different emails", () => {
      expect(isEmailMatch("user1@example.com", "user2@example.com")).toBe(false);
    });

    it("handles null, undefined, and empty email strings", () => {
      expect(isEmailMatch(null, "user@example.com")).toBe(false);
      expect(isEmailMatch("user@example.com", undefined)).toBe(false);
      expect(isEmailMatch("", "")).toBe(false);
    });
  });

  describe("3. Registration & Login Smart Linking (linkUserToExistingTripMembers via /api/trips/link-members)", () => {
    const mockUser: UserAccount = {
      id: "usr_ayan_100",
      name: "Ayan Roy",
      email: "ayanroy525@gmail.com",
      phone: "+91 9062069475",
      avatarColor: "#0F6B65",
      createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("links unlinked trip members by phone/email via server endpoint and returns counts", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          linkedMembersCount: 1,
          linkedTripsCount: 1,
        }),
      } as any);

      const result = await linkUserToExistingTripMembers(mockUser);

      expect(result.linkedMembersCount).toBe(1);
      expect(result.linkedTripsCount).toBe(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/trips/link-members"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("links multiple trips in a single registration/login run", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          linkedMembersCount: 2,
          linkedTripsCount: 2,
        }),
      } as any);

      const result = await linkUserToExistingTripMembers(mockUser);

      expect(result.linkedMembersCount).toBe(2);
      expect(result.linkedTripsCount).toBe(2);
    });

    it("is idempotent: returns 0 when members are already linked", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          linkedMembersCount: 0,
          linkedTripsCount: 0,
        }),
      } as any);

      const result = await linkUserToExistingTripMembers(mockUser);

      expect(result.linkedMembersCount).toBe(0);
      expect(result.linkedTripsCount).toBe(0);
    });

    it("returns zero links safely without network call if user has no phone or email", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const emptyUser: UserAccount = {
        id: "usr_empty",
        name: "Anonymous",
        email: "",
        phone: "",
        avatarColor: "#0F6B65",
        createdAt: new Date().toISOString(),
      };

      const result = await linkUserToExistingTripMembers(emptyUser);
      expect(result.linkedMembersCount).toBe(0);
      expect(result.linkedTripsCount).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("4. Member Additions to Trip with Existing Registered User (addMemberToDatabase via /api/trips/:tripId/trip_members)", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("auto-resolves userId when adding a member by phone who is already registered", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          member: {
            id: "m_temp_123",
            tripId: "trip_manali",
            userId: "usr_sneha_registered",
            name: "Sneha Sharma",
            role: "member",
            avatarColor: "#0F6B65",
            phone: "9876543210",
            status: "active",
          },
        }),
      } as any);

      const newMember: Member = {
        id: "m_temp_123",
        tripId: "trip_manali",
        name: "Member",
        role: "member",
        avatarColor: "#0F6B65",
        phone: "9876543210",
        joinedAt: new Date().toISOString(),
        status: "active",
      };

      const saved = await addMemberToDatabase("trip_manali", newMember);

      expect(saved.userId).toBe("usr_sneha_registered");
      expect(saved.name).toBe("Sneha Sharma");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/trips/trip_manali/trip_members"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("keeps unlinked ID if added member has not registered yet", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          member: {
            id: "m_new_friend",
            tripId: "trip_kerala",
            userId: "m_new_friend",
            name: "Vikram",
            role: "member",
            avatarColor: "#0F6B65",
            phone: "+91 9123456780",
            status: "active",
          },
        }),
      } as any);

      const unregisteredMember: Member = {
        id: "m_new_friend",
        tripId: "trip_kerala",
        name: "Vikram",
        role: "member",
        avatarColor: "#0F6B65",
        phone: "+91 9123456780",
        joinedAt: new Date().toISOString(),
        status: "active",
      };

      const saved = await addMemberToDatabase("trip_kerala", unregisteredMember);
      expect(saved.userId).toBe("m_new_friend");
    });

    it("auto-resolves userId when adding a member by email who is already registered", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          member: {
            id: "m_amit_temp",
            tripId: "trip_jaipur",
            userId: "usr_amit_456",
            name: "Amit Patel",
            role: "member",
            avatarColor: "#0F6B65",
            email: "Amit.Patel@gmail.com",
            status: "active",
          },
        }),
      } as any);

      const memberByEmail: Member = {
        id: "m_amit_temp",
        tripId: "trip_jaipur",
        name: "Traveler",
        role: "member",
        avatarColor: "#0F6B65",
        email: "Amit.Patel@gmail.com",
        joinedAt: new Date().toISOString(),
        status: "active",
      };

      const saved = await addMemberToDatabase("trip_jaipur", memberByEmail);
      expect(saved.userId).toBe("usr_amit_456");
      expect(saved.name).toBe("Amit Patel");
    });
  });
});
