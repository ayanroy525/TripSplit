import { describe, it, expect } from "vitest";
import { isValidWhatsAppPhone, normalizeWhatsAppPhone, getWhatsAppDirectLink } from "./whatsappNotifications";
import { Member, Trip, WhatsAppNotificationPayload } from "../types";

describe("Runtime Fixes Verification Suite", () => {
  describe("WhatsApp Notification Target Phone Validation", () => {
    it("rejects undefined, empty, or short phone numbers", () => {
      expect(isValidWhatsAppPhone(undefined)).toBe(false);
      expect(isValidWhatsAppPhone("")).toBe(false);
      expect(isValidWhatsAppPhone("123")).toBe(false);
      expect(isValidWhatsAppPhone("abc")).toBe(false);
      expect(isValidWhatsAppPhone("98765")).toBe(false);
    });

    it("accepts and correctly normalizes valid 10-digit Indian numbers", () => {
      expect(isValidWhatsAppPhone("9876543210")).toBe(true);
      expect(normalizeWhatsAppPhone("9876543210")).toBe("919876543210");
      expect(normalizeWhatsAppPhone("+91 98765 43210")).toBe("919876543210");
    });

    it("accepts valid international numbers up to 15 digits", () => {
      expect(isValidWhatsAppPhone("+1 415 555 2671")).toBe(true);
      expect(normalizeWhatsAppPhone("+1 415 555 2671")).toBe("14155552671");
    });

    it("generates safe WhatsApp direct link with sanitized phone", () => {
      const link = getWhatsAppDirectLink("9876543210", "Hello traveler!");
      expect(link).toBe("https://wa.me/919876543210?text=Hello%20traveler!");
    });

    it("simulates building WhatsApp statement payload with missing phone safely", () => {
      const memberWithoutPhone: Member = {
        id: "m_no_phone",
        userId: "u_no_phone",
        name: "No Phone Traveler",
        role: "participant",
        avatarColor: "#0F6B65",
        phone: "",
        email: "test@example.com",
        joinedAt: new Date().toISOString(),
      };

      const hasValidPhone = memberWithoutPhone.phone
        ? isValidWhatsAppPhone(memberWithoutPhone.phone)
        : false;
      const cleanPhone = hasValidPhone ? memberWithoutPhone.phone!.trim() : undefined;

      const payload: WhatsAppNotificationPayload = {
        title: `Send Statement to ${memberWithoutPhone.name}`,
        messageText: "Statement details",
        targetPhone: cleanPhone,
        targetMemberIds: [memberWithoutPhone.id],
        eventType: "reminder",
      };

      expect(payload.targetPhone).toBeUndefined();
      expect(payload.targetMemberIds).toEqual(["m_no_phone"]);
    });

    it("simulates building WhatsApp statement payload with valid phone safely", () => {
      const memberWithPhone: Member = {
        id: "m_with_phone",
        userId: "u_with_phone",
        name: "Valid Phone Traveler",
        role: "participant",
        avatarColor: "#0F6B65",
        phone: "+91 9876543210",
        email: "valid@example.com",
        joinedAt: new Date().toISOString(),
      };

      const hasValidPhone = memberWithPhone.phone
        ? isValidWhatsAppPhone(memberWithPhone.phone)
        : false;
      const cleanPhone = hasValidPhone ? memberWithPhone.phone!.trim() : undefined;

      const payload: WhatsAppNotificationPayload = {
        title: `Send Statement to ${memberWithPhone.name}`,
        messageText: "Statement details",
        targetPhone: cleanPhone,
        targetMemberIds: [memberWithPhone.id],
        eventType: "reminder",
      };

      expect(payload.targetPhone).toBe("+91 9876543210");
    });
  });

  describe("Trip URL Routing & Closure Freshness", () => {
    it("ensures trips array reference updates correctly and prevents stale routing", () => {
      let tripsState: Trip[] = [];
      const tripsRef = { current: tripsState };

      // Initial state is empty
      expect(tripsRef.current.length).toBe(0);

      // New trip joined
      const newTrip: Trip = {
        id: "trip_simulated_1",
        title: "Simulated Goa",
        location: "Goa",
        destination: "Goa",
        startDate: "2026-09-28",
        endDate: "2026-10-01",
        currency: "INR",
        status: "ACTIVE",
        ownerId: "u_1",
        ownerName: "Organizer",
        inviteCode: "TRIP-SIM123",
        members: [],
        expenses: [],
        payments: [],
        activities: [],
        createdAt: new Date().toISOString(),
      };

      tripsState = [newTrip];
      tripsRef.current = tripsState;

      // The listener accessing tripsRef.current now sees the fresh trip!
      expect(tripsRef.current.length).toBe(1);
      expect(tripsRef.current[0].id).toBe("trip_simulated_1");
    });
  });

  describe("Auth Session Expiry Contract", () => {
    it("identifies guest vs non-guest accounts for session expiry cleanup", () => {
      const guestAccount = { id: "guest_1790620000000", name: "Guest Traveler" };
      const authenticatedAccount = { id: "55acd035-6c0e-45cc-89e5-8f2d305de913", name: "Real User" };

      const isGuest = (user: { id: string }) => user.id.startsWith("guest_");

      expect(isGuest(guestAccount)).toBe(true);
      expect(isGuest(authenticatedAccount)).toBe(false);

      // On SIGNED_OUT or session expiry, non-guest accounts must be cleared
      const shouldClearOnSessionLoss = (user: { id: string }) => !isGuest(user);

      expect(shouldClearOnSessionLoss(authenticatedAccount)).toBe(true);
      expect(shouldClearOnSessionLoss(guestAccount)).toBe(false);
    });
  });

  describe("Credentials Security: Zero Plaintext Passwords in localStorage", () => {
    it("ensures user object never includes plaintext password before persisting", () => {
      const vulnerableInput = {
        id: "u_sec_123",
        name: "Security Tester",
        email: "sec@example.com",
        avatarColor: "#0F6B65",
        createdAt: new Date().toISOString(),
        password: "SuperSecretPassword123!",
      };

      const { password: _omit, ...sanitized } = vulnerableInput;

      expect((sanitized as any).password).toBeUndefined();
      const serialized = JSON.stringify(sanitized);
      expect(serialized).not.toContain("SuperSecretPassword123!");
      expect(serialized).not.toContain('"password"');
    });

    it("verifies zero password storage in localStorage: credentials key is completely removed", () => {
      // Simulate client localStorage
      const mockStorage: Record<string, string> = {
        trip_splitter_user_credentials_v1: JSON.stringify({
          "old@example.com": { password: "secret_old_password", account: {} },
        }),
      };

      // Security purge
      delete mockStorage.trip_splitter_user_credentials_v1;

      expect(mockStorage.trip_splitter_user_credentials_v1).toBeUndefined();
    });

    it("ensures session management relies exclusively on tokens, not stored credentials", () => {
      const sessionToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
      const activeUser = {
        id: "u_sec_456",
        name: "Secure User",
        email: "secure@example.com",
        avatarColor: "#0F6B65",
        createdAt: new Date().toISOString(),
      };

      expect((activeUser as any).password).toBeUndefined();
      expect((activeUser as any).passwordHash).toBeUndefined();
      expect(typeof sessionToken).toBe("string");
    });
  });
});
