import { describe, it, expect } from "vitest";
import {
  generateTripInviteWhatsAppMsg,
  generateExpenseAddedWhatsAppMsg,
  generateExpenseUpdatedWhatsAppMsg,
  generateExpenseDeletedWhatsAppMsg,
  generateSettlementWhatsAppMsg,
  generateIndividualExpenseWhatsAppMsg,
  generateIndividualDebtReminderWhatsAppMsg,
  normalizeWhatsAppPhone,
  isValidWhatsAppPhone,
  getWhatsAppDirectLink,
  getWhatsAppShareLink,
} from "./whatsappNotifications";
import { playNotificationChime } from "./notificationSound";
import { AppNotification, Trip, Expense, Payment, Member } from "../types";

const mockTrip: Trip = {
  id: "trip_test_123",
  title: "Goa Vacation",
  location: "Goa, India",
  currency: "INR",
  startDate: "2026-10-01",
  endDate: "2026-10-05",
  members: [
    { id: "m1", name: "Ayan Roy", email: "ayanroy525@gmail.com", phone: "+91 9062069475", role: "admin", avatarColor: "#0F6B65" },
    { id: "m2", name: "Alex", email: "alex@example.com", phone: "+91 9876543210", role: "participant", avatarColor: "#E39A2D" },
    { id: "m3", name: "Sneha", email: "sneha@example.com", phone: "9876500000", role: "participant", avatarColor: "#C2543A" },
  ],
  expenses: [],
  payments: [],
  activities: [],
  createdAt: "2026-10-01T00:00:00.000Z",
};

const mockExpense: Expense = {
  id: "exp_101",
  tripId: "trip_test_123",
  title: "Beachside Seafood Dinner",
  amount: 4500,
  category: "food",
  paidBy: "m1",
  createdBy: "m1",
  date: "2026-10-02",
  method: "equal",
  participants: ["m1", "m2", "m3"],
  splits: { m1: 1500, m2: 1500, m3: 1500 },
  createdAt: "2026-10-02T19:00:00.000Z",
};

const mockPayment: Payment = {
  id: "pay_201",
  tripId: "trip_test_123",
  from: "m2",
  to: "m1",
  amount: 1500,
  status: "confirmed",
  note: "UPI payment via GPay",
  createdAt: "2026-10-03T10:00:00.000Z",
};

describe("Notification & Notification Bar Systems", () => {
  describe("Phone Normalization & WhatsApp Deep Links", () => {
    it("normalizes Indian 10-digit phone numbers with 91 country code", () => {
      expect(normalizeWhatsAppPhone("9062069475")).toBe("919062069475");
      expect(normalizeWhatsAppPhone("+91 9062069475")).toBe("919062069475");
      expect(normalizeWhatsAppPhone("09062069475")).toBe("919062069475");
    });

    it("correctly identifies valid WhatsApp phone numbers", () => {
      expect(isValidWhatsAppPhone("+91 9062069475")).toBe(true);
      expect(isValidWhatsAppPhone("9876543210")).toBe(true);
      expect(isValidWhatsAppPhone("123")).toBe(false);
      expect(isValidWhatsAppPhone("")).toBe(false);
    });

    it("generates wa.me direct links with encoded message", () => {
      const link = getWhatsAppDirectLink("+91 9062069475", "Hello from TripSplit!");
      expect(link).toContain("https://wa.me/919062069475?text=Hello%20from%20TripSplit!");
    });

    it("generates wa.me share link without specific phone", () => {
      const link = getWhatsAppShareLink("Trip update");
      expect(link).toBe("https://wa.me/?text=Trip%20update");
    });
  });

  describe("WhatsApp Broadcast Notifications", () => {
    it("generates well-formatted Trip Invite WhatsApp message", () => {
      const msg = generateTripInviteWhatsAppMsg(mockTrip, "Ayan Roy", "https://tripsplit.app/join/TRIP-GOA123", "TRIP-GOA123");
      expect(msg).toContain("Goa Vacation");
      expect(msg).toContain("Goa, India");
      expect(msg).toContain("Ayan Roy");
      expect(msg).toContain("TRIP-GOA123");
    });

    it("generates well-formatted Expense Added WhatsApp message with split breakdown", () => {
      const msg = generateExpenseAddedWhatsAppMsg(mockTrip, mockExpense, "Ayan Roy");
      expect(msg).toContain("Beachside Seafood Dinner");
      expect(msg).toContain("4,500");
      expect(msg).toContain("Ayan Roy");
      expect(msg).toContain("EQUAL");
      expect(msg).toContain("Alex");
      expect(msg).toContain("Sneha");
    });

    it("generates expense updated notification message", () => {
      const updatedExpense = { ...mockExpense, amount: 5000, title: "Special Seafood Dinner" };
      const msg = generateExpenseUpdatedWhatsAppMsg(mockTrip, updatedExpense, "Ayan Roy");
      expect(msg).toContain("Expense Updated");
      expect(msg).toContain("Special Seafood Dinner");
      expect(msg).toContain("5,000");
    });

    it("generates expense deleted notification message", () => {
      const msg = generateExpenseDeletedWhatsAppMsg(mockTrip, mockExpense, "Ayan Roy");
      expect(msg).toContain("Expense Deleted");
      expect(msg).toContain("Beachside Seafood Dinner");
    });

    it("generates settlement recorded notification message", () => {
      const msg = generateSettlementWhatsAppMsg(mockTrip, mockPayment, "Ayan Roy");
      expect(msg).toContain("Payment Settlement Recorded");
      expect(msg).toContain("Alex");
      expect(msg).toContain("Ayan Roy");
      expect(msg).toContain("1,500");
    });

    it("generates personalized debt reminder message", () => {
      const debtor: Member = mockTrip.members[1];
      const creditor: Member = mockTrip.members[0];
      const msg = generateIndividualDebtReminderWhatsAppMsg(mockTrip, debtor, creditor, 1500, "Please clear via UPI");
      expect(msg).toContain("Alex");
      expect(msg).toContain("Ayan Roy");
      expect(msg).toContain("1,500");
      expect(msg).toContain("Please clear via UPI");
    });

    it("generates individual expense breakdown notification for participant", () => {
      const participant: Member = mockTrip.members[1];
      const msg = generateIndividualExpenseWhatsAppMsg(mockTrip, mockExpense, participant, "Ayan Roy");
      expect(msg).toContain("Hi Alex");
      expect(msg).toContain("Beachside Seafood Dinner");
      expect(msg).toContain("1,500");
    });
  });

  describe("Notification Center Filtering & State Logic", () => {
    const notifications: AppNotification[] = [
      {
        id: "n1",
        tripId: "trip_1",
        tripTitle: "Goa Trip",
        type: "expense_added",
        title: "New Expense Added",
        body: "Ayan added Hotel for ₹8,000",
        actorName: "Ayan",
        read: false,
        timestamp: new Date().toISOString(),
      },
      {
        id: "n2",
        tripId: "trip_1",
        tripTitle: "Goa Trip",
        type: "payment_recorded",
        title: "Payment Recorded",
        body: "Alex recorded ₹2,000 to Ayan",
        actorName: "Alex",
        read: true,
        timestamp: new Date().toISOString(),
      },
      {
        id: "n3",
        tripId: "trip_1",
        tripTitle: "Goa Trip",
        type: "member_joined",
        title: "Member Joined",
        body: "Sneha joined the trip",
        actorName: "Sneha",
        read: false,
        timestamp: new Date().toISOString(),
      },
    ];

    it("calculates unread notification badge count accurately", () => {
      const unreadCount = notifications.filter((n) => !n.read).length;
      expect(unreadCount).toBe(2);
    });

    it("filters notifications by unread state", () => {
      const unreadList = notifications.filter((n) => !n.read);
      expect(unreadList.length).toBe(2);
      expect(unreadList.map((n) => n.id)).toEqual(["n1", "n3"]);
    });

    it("filters notifications by expense category", () => {
      const expenseList = notifications.filter(
        (n) => n.type === "expense_added" || n.type === "expense_updated" || n.type === "expense_deleted"
      );
      expect(expenseList.length).toBe(1);
      expect(expenseList[0].id).toBe("n1");
    });

    it("filters notifications by settlement category", () => {
      const settlementList = notifications.filter(
        (n) => n.type === "payment_recorded" || n.type === "payment_confirmed" || n.type === "debt_reminder"
      );
      expect(settlementList.length).toBe(1);
      expect(settlementList[0].id).toBe("n2");
    });

    it("filters notifications by member category", () => {
      const memberList = notifications.filter(
        (n) => n.type === "member_joined" || n.type === "member_added" || n.type === "member_updated"
      );
      expect(memberList.length).toBe(1);
      expect(memberList[0].id).toBe("n3");
    });

    it("safely invokes notification sound without throwing in any environment", () => {
      expect(() => playNotificationChime("default")).not.toThrow();
      expect(() => playNotificationChime("success")).not.toThrow();
      expect(() => playNotificationChime("alert")).not.toThrow();
      expect(() => playNotificationChime("subtle")).not.toThrow();
    });
  });
});
