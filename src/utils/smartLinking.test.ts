import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPhoneMatch, isEmailMatch, linkUserToExistingTripMembers, addMemberToDatabase } from "./storage";
import { supabase } from "./supabaseClient";
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

  describe("3. Registration & Login Smart Linking (linkUserToExistingTripMembers)", () => {
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

    it("links unlinked trip members by phone number and updates trips table", async () => {
      const mockTripMembers = [
        {
          id: "m_1",
          trip_id: "trip_darjeeling_1",
          user_id: "m_1", // unlinked placeholder
          name: "Member",
          phone: "9062069475",
          email: "",
        },
        {
          id: "m_2",
          trip_id: "trip_goa_2",
          user_id: "usr_other_999",
          name: "Rohan",
          phone: "+91 9999999999",
          email: "rohan@example.com",
        },
      ];

      const updateTripMemberSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const updateTripSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "trip_members") {
          return {
            select: vi.fn().mockResolvedValue({ data: mockTripMembers, error: null }),
            update: updateTripMemberSpy,
          } as any;
        }
        if (table === "trips") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "trip_darjeeling_1", member_user_ids: ["usr_owner_1"] },
                  error: null,
                }),
              }),
            }),
            update: updateTripSpy,
          } as any;
        }
        return {} as any;
      });

      const result = await linkUserToExistingTripMembers(mockUser);

      expect(result.linkedMembersCount).toBe(1);
      expect(result.linkedTripsCount).toBe(1);

      // Verify trip_members was updated with user_id and user's full name (since placeholder was "Member")
      expect(updateTripMemberSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "usr_ayan_100",
          name: "Ayan Roy",
          email: "ayanroy525@gmail.com",
        })
      );

      // Verify trip was updated with member_user_ids including the newly registered user
      expect(updateTripSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          member_user_ids: ["usr_owner_1", "usr_ayan_100"],
        })
      );
    });

    it("links unlinked trip members by email address and preserves custom name", async () => {
      const mockTripMembers = [
        {
          id: "m_sneha",
          trip_id: "trip_ladakh_3",
          user_id: "m_sneha", // unlinked placeholder
          name: "Sneha Travel Partner", // custom name, should NOT be overwritten!
          phone: "",
          email: "AYANROY525@GMAIL.COM", // uppercase email
        },
      ];

      const updateTripMemberSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const updateTripSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "trip_members") {
          return {
            select: vi.fn().mockResolvedValue({ data: mockTripMembers, error: null }),
            update: updateTripMemberSpy,
          } as any;
        }
        if (table === "trips") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "trip_ladakh_3", member_user_ids: [] },
                  error: null,
                }),
              }),
            }),
            update: updateTripSpy,
          } as any;
        }
        return {} as any;
      });

      const result = await linkUserToExistingTripMembers(mockUser);

      expect(result.linkedMembersCount).toBe(1);
      expect(result.linkedTripsCount).toBe(1);

      // Custom name must NOT be overwritten by user.name!
      expect(updateTripMemberSpy).toHaveBeenCalledWith(
        expect.not.objectContaining({ name: "Ayan Roy" })
      );
      expect(updateTripMemberSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "usr_ayan_100",
          phone: "+91 9062069475",
        })
      );
    });

    it("links multiple trips in a single registration/login run", async () => {
      const mockTripMembers = [
        {
          id: "m_trip1",
          trip_id: "trip_1",
          user_id: "m_trip1",
          name: "Guest",
          phone: "+91 9062069475",
          email: "",
        },
        {
          id: "m_trip2",
          trip_id: "trip_2",
          user_id: "m_trip2",
          name: "Traveler",
          phone: "",
          email: "ayanroy525@gmail.com",
        },
      ];

      const updateTripMemberSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const updateTripSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "trip_members") {
          return {
            select: vi.fn().mockResolvedValue({ data: mockTripMembers, error: null }),
            update: updateTripMemberSpy,
          } as any;
        }
        if (table === "trips") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "trip_x", member_user_ids: [] },
                  error: null,
                }),
              }),
            }),
            update: updateTripSpy,
          } as any;
        }
        return {} as any;
      });

      const result = await linkUserToExistingTripMembers(mockUser);

      expect(result.linkedMembersCount).toBe(2);
      expect(result.linkedTripsCount).toBe(2);
    });

    it("is idempotent: skips already linked members safely", async () => {
      const mockTripMembers = [
        {
          id: "m_already_linked",
          trip_id: "trip_1",
          user_id: "usr_ayan_100", // already linked!
          name: "Ayan Roy",
          phone: "9062069475",
          email: "ayanroy525@gmail.com",
        },
      ];

      const updateTripMemberSpy = vi.fn();

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "trip_members") {
          return {
            select: vi.fn().mockResolvedValue({ data: mockTripMembers, error: null }),
            update: updateTripMemberSpy,
          } as any;
        }
        return {} as any;
      });

      const result = await linkUserToExistingTripMembers(mockUser);

      expect(result.linkedMembersCount).toBe(0);
      expect(result.linkedTripsCount).toBe(0);
      expect(updateTripMemberSpy).not.toHaveBeenCalled();
    });

    it("returns zero links safely if user has no phone or email", async () => {
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
    });
  });

  describe("4. Member Additions to Trip with Existing Registered User (addMemberToDatabase)", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("auto-resolves userId when adding a member by phone who is already registered", async () => {
      const registeredUsers = [
        {
          id: "usr_sneha_registered",
          name: "Sneha Sharma",
          email: "sneha@example.com",
          phone: "+91 9876543210",
        },
      ];

      const upsertMemberSpy = vi.fn().mockResolvedValue({ error: null });
      const updateTripSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockResolvedValue({ data: registeredUsers, error: null }),
          } as any;
        }
        if (table === "trip_members") {
          return {
            upsert: upsertMemberSpy,
          } as any;
        }
        if (table === "trips") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "trip_manali", member_user_ids: ["usr_owner"] },
                  error: null,
                }),
              }),
            }),
            update: updateTripSpy,
          } as any;
        }
        return {} as any;
      });

      const newMember: Member = {
        id: "m_temp_123",
        tripId: "trip_manali",
        name: "Member",
        role: "member",
        avatarColor: "#0F6B65",
        phone: "9876543210", // 10-digit without +91
        joinedAt: new Date().toISOString(),
        status: "active",
      };

      const saved = await addMemberToDatabase("trip_manali", newMember);

      // Verify the member was linked directly to Sneha's registered account
      expect(saved.userId).toBe("usr_sneha_registered");
      expect(saved.name).toBe("Sneha Sharma");

      // Verify upsert in trip_members stored user_id = usr_sneha_registered
      expect(upsertMemberSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "usr_sneha_registered",
          name: "Sneha Sharma",
        })
      );

      // Verify trip's member_user_ids was updated to include Sneha
      expect(updateTripSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          member_user_ids: ["usr_owner", "usr_sneha_registered"],
        })
      );
    });

    it("keeps unlinked ID if added member has not registered yet", async () => {
      const upsertMemberSpy = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }), // No matching user
          } as any;
        }
        if (table === "trip_members") {
          return {
            upsert: upsertMemberSpy,
          } as any;
        }
        return {} as any;
      });

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

      // Retains unlinked ID until Vikram registers
      expect(saved.userId).toBe("m_new_friend");
      expect(upsertMemberSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "m_new_friend",
          phone: "+91 9123456780",
        })
      );
    });

    it("auto-resolves userId when adding a member by email who is already registered", async () => {
      const registeredUsers = [
        {
          id: "usr_amit_456",
          name: "Amit Patel",
          email: "amit.patel@gmail.com",
          phone: "+91 9898989898",
        },
      ];

      const upsertMemberSpy = vi.fn().mockResolvedValue({ error: null });
      const updateTripSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockResolvedValue({ data: registeredUsers, error: null }),
          } as any;
        }
        if (table === "trip_members") {
          return {
            upsert: upsertMemberSpy,
          } as any;
        }
        if (table === "trips") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "trip_jaipur", member_user_ids: ["usr_owner"] },
                  error: null,
                }),
              }),
            }),
            update: updateTripSpy,
          } as any;
        }
        return {} as any;
      });

      const memberByEmail: Member = {
        id: "m_amit_temp",
        tripId: "trip_jaipur",
        name: "Traveler", // placeholder name
        role: "member",
        avatarColor: "#0F6B65",
        email: "Amit.Patel@gmail.com", // casing difference
        joinedAt: new Date().toISOString(),
        status: "active",
      };

      const saved = await addMemberToDatabase("trip_jaipur", memberByEmail);

      expect(saved.userId).toBe("usr_amit_456");
      expect(saved.name).toBe("Amit Patel"); // placeholder replaced with registered name

      expect(upsertMemberSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "usr_amit_456",
          name: "Amit Patel",
          email: "Amit.Patel@gmail.com",
        })
      );

      expect(updateTripSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          member_user_ids: ["usr_owner", "usr_amit_456"],
        })
      );
    });

    it("does not duplicate userId in trips.member_user_ids if already present", async () => {
      const registeredUsers = [
        {
          id: "usr_existing_member",
          name: "Pooja",
          email: "pooja@example.com",
          phone: "+91 9777777777",
        },
      ];

      const upsertMemberSpy = vi.fn().mockResolvedValue({ error: null });
      const updateTripSpy = vi.fn();

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockResolvedValue({ data: registeredUsers, error: null }),
          } as any;
        }
        if (table === "trip_members") {
          return {
            upsert: upsertMemberSpy,
          } as any;
        }
        if (table === "trips") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "trip_kashmir",
                    // Already in member_user_ids
                    member_user_ids: ["usr_owner", "usr_existing_member"],
                  },
                  error: null,
                }),
              }),
            }),
            update: updateTripSpy,
          } as any;
        }
        return {} as any;
      });

      const member: Member = {
        id: "m_pooja_new",
        tripId: "trip_kashmir",
        name: "Pooja",
        role: "member",
        avatarColor: "#0F6B65",
        phone: "+91 9777777777",
        joinedAt: new Date().toISOString(),
        status: "active",
      };

      const saved = await addMemberToDatabase("trip_kashmir", member);
      expect(saved.userId).toBe("usr_existing_member");

      // Because usr_existing_member was already in member_user_ids, no trip update is needed
      expect(updateTripSpy).not.toHaveBeenCalled();
    });
  });
});
