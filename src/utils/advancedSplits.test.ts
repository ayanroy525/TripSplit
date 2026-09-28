import { describe, it, expect } from "vitest";
import {
  equalSplit,
  percentageSplit,
  sharesSplit,
  itemizedSplit,
  autoBalanceExactSplit,
  autoBalancePercentageSplit,
  computeBalances,
  simplifyDebts,
  toCents,
  fromCents,
  round2,
} from "./calculations";
import { ReceiptItem, Member, Expense, Payment } from "../types";

describe("Advanced Split Models & Calculation Engine", () => {
  // --------------------------------------------------------------------------
  // 1. ITEMIZED SPLITS
  // --------------------------------------------------------------------------
  describe("Itemized Splits (Receipt Line Items)", () => {
    it("correctly allocates specific line items to specific individuals", () => {
      // Scenario:
      // Alice, Bob, Carol, Dave go to a restaurant:
      // Item 1: Veg Starters (₹400) - Shared by Alice, Bob, Carol, Dave (₹100 each)
      // Item 2: Alcohol / Cocktails (₹800) - Only Alice and Bob drank (₹400 each; Carol & Dave didn't drink)
      // Item 3: Special Dessert (₹300) - Only Carol ordered (₹300)
      // Item 4: Taxi to Venue (₹500) - Bob, Carol, Dave took the taxi (Alice arrived on foot)
      const items: ReceiptItem[] = [
        { id: "i1", title: "Veg Starters", amount: 400, participants: ["alice", "bob", "carol", "dave"] },
        { id: "i2", title: "Alcohol / Cocktails", amount: 800, participants: ["alice", "bob"] },
        { id: "i3", title: "Special Dessert", amount: 300, participants: ["carol"] },
        { id: "i4", title: "Taxi to Venue", amount: 500, participants: ["bob", "carol", "dave"] },
      ];

      const { splits, totalAmount } = itemizedSplit(items, ["alice", "bob", "carol", "dave"]);

      // Total bill: 400 + 800 + 300 + 500 = 2000
      expect(totalAmount).toBe(2000);

      // Alice: 100 (starters) + 400 (alcohol) = 500
      expect(splits["alice"]).toBe(500);

      // Bob: 100 (starters) + 400 (alcohol) + 166.67 (taxi) = 666.67
      // Carol: 100 (starters) + 300 (dessert) + 166.67 (taxi) = 566.67
      // Dave: 100 (starters) + 166.66 (taxi) = 266.66
      // Dave and Carol and Bob split 500 => 166.67, 166.67, 166.66 (total 500)
      expect(splits["bob"] + splits["carol"] + splits["dave"] + splits["alice"]).toBe(2000);

      // Verify that non-drinkers Carol & Dave paid ₹0 for the alcohol
      const alcoholOnly = itemizedSplit([items[1]], ["alice", "bob", "carol", "dave"]);
      expect(alcoholOnly.splits["carol"]).toBeUndefined();
      expect(alcoholOnly.splits["dave"]).toBeUndefined();
      expect(alcoholOnly.splits["alice"]).toBe(400);
      expect(alcoholOnly.splits["bob"]).toBe(400);
    });

    it("preserves exact paisa sum across non-divisible itemized amounts", () => {
      // 3 items with odd amounts and differing participants:
      // Item 1: ₹100.00 shared by 3 people (33.34, 33.33, 33.33)
      // Item 2: ₹200.00 shared by 3 people (66.67, 66.67, 66.66)
      // Item 3: ₹55.55 shared by 2 people (27.78, 27.77)
      const items: ReceiptItem[] = [
        { id: "i1", title: "Shared Dish", amount: 100, participants: ["p1", "p2", "p3"] },
        { id: "i2", title: "Appetizers", amount: 200, participants: ["p1", "p2", "p3"] },
        { id: "i3", title: "Coffee", amount: 55.55, participants: ["p1", "p2"] },
      ];

      const { splits, totalAmount } = itemizedSplit(items);
      expect(totalAmount).toBe(355.55);

      const sum = Object.values(splits).reduce((a, b) => a + b, 0);
      expect(round2(sum)).toBe(355.55);
    });

    it("falls back to general participants when a line item has no explicit participants", () => {
      const items: ReceiptItem[] = [
        { id: "i1", title: "Cover Charge / Service Fee", amount: 300, participants: [] },
      ];
      const { splits, totalAmount } = itemizedSplit(items, ["m1", "m2", "m3"]);
      expect(totalAmount).toBe(300);
      expect(splits["m1"]).toBe(100);
      expect(splits["m2"]).toBe(100);
      expect(splits["m3"]).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // 2. PERCENTAGE & SHARES / WEIGHTS SPLITS
  // --------------------------------------------------------------------------
  describe("Percentage & Shares/Weights Splits", () => {
    it("splits expenses accurately using integer shares/weights for couples vs solo travelers", () => {
      // Scenario: Resort villa rental of ₹12,000
      // Alice & partner (Couple): 2 shares
      // Bob (Solo): 1 share
      // Charlie (Solo): 1 share
      // Total shares = 4. Couple pays 2/4 = ₹6,000. Solos pay 1/4 = ₹3,000 each.
      const shares = {
        couple_alice: 2,
        solo_bob: 1,
        solo_charlie: 1,
      };

      const splits = sharesSplit(12000, shares, ["couple_alice", "solo_bob", "solo_charlie"]);
      expect(splits["couple_alice"]).toBe(6000);
      expect(splits["solo_bob"]).toBe(3000);
      expect(splits["solo_charlie"]).toBe(3000);
      expect(splits["couple_alice"] + splits["solo_bob"] + splits["solo_charlie"]).toBe(12000);
    });

    it("handles uneven shares with exact penny conservation", () => {
      // ₹100 split 2 shares vs 1 share
      // Total shares = 3. 100/3 = 33.333...
      // Couple (2 shares): ₹66.67
      // Solo (1 share): ₹33.33
      const splits = sharesSplit(100, { couple: 2, solo: 1 }, ["couple", "solo"]);
      expect(splits["couple"]).toBe(66.67);
      expect(splits["solo"]).toBe(33.33);
      expect(round2(splits["couple"] + splits["solo"])).toBe(100);
    });

    it("splits expenses accurately using custom percentage ratios with exact remainder allocation", () => {
      // ₹1,000 split: Alice 50%, Bob 30%, Carol 20%
      const splits = percentageSplit(
        1000,
        { alice: 50, bob: 30, carol: 20 },
        ["alice", "bob", "carol"]
      );
      expect(splits["alice"]).toBe(500);
      expect(splits["bob"]).toBe(300);
      expect(splits["carol"]).toBe(200);
      expect(splits["alice"] + splits["bob"] + splits["carol"]).toBe(1000);
    });

    it("handles 3-way 33.33% percentage split without losing 1 paisa", () => {
      // ₹100 split 33.33%, 33.33%, 33.34%
      const splits = percentageSplit(
        100,
        { p1: 33.33, p2: 33.33, p3: 33.34 },
        ["p1", "p2", "p3"]
      );
      const sum = round2(splits["p1"] + splits["p2"] + splits["p3"]);
      expect(sum).toBe(100);
    });

    it("auto-balances remaining percentage to reach exactly 100%", () => {
      // User entered Alice: 40%, Bob: 35%. Remaining 25% should be assigned to Carol.
      const currentPct = { alice: 40, bob: 35, carol: 0 };
      const balanced = autoBalancePercentageSplit(currentPct, "carol");
      expect(balanced["carol"]).toBe(25);
      expect(balanced["alice"] + balanced["bob"] + balanced["carol"]).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // 3. EXACT UNEQUAL AMOUNTS & AUTO-BALANCING
  // --------------------------------------------------------------------------
  describe("Exact Unequal Amounts & Auto-Balancing", () => {
    it("auto-balances the remaining difference onto a designated participant", () => {
      // Total bill: ₹5,000
      // Alice knows she owes exactly ₹1,850.50
      // Bob knows he owes ₹1,200.00
      // Carol should get the exact remaining amount: 5000 - 1850.50 - 1200 = 1949.50
      const current = {
        alice: 1850.5,
        bob: 1200,
        carol: 0,
      };

      const balanced = autoBalanceExactSplit(5000, current, "carol", ["alice", "bob", "carol"]);
      expect(balanced["carol"]).toBe(1949.5);
      expect(round2(balanced["alice"] + balanced["bob"] + balanced["carol"])).toBe(5000);
    });

    it("distributes remaining difference evenly across unassigned participants", () => {
      // Total bill: ₹3,000
      // Alice pays exact ₹1,000.
      // Bob and Carol haven't entered anything yet (both unassigned).
      // Remaining ₹2,000 should be split evenly: ₹1,000 to Bob and ₹1,000 to Carol.
      const current = { alice: 1000, bob: 0, carol: 0 };
      const balanced = autoBalanceExactSplit(3000, current, undefined, ["alice", "bob", "carol"]);
      expect(balanced["alice"]).toBe(1000);
      expect(balanced["bob"]).toBe(1000);
      expect(balanced["carol"]).toBe(1000);
      expect(balanced["alice"] + balanced["bob"] + balanced["carol"]).toBe(3000);
    });

    it("handles odd remaining cents during exact auto-balance distribution", () => {
      // Total bill: ₹100
      // Alice pays ₹10
      // Remaining ₹90 distributed between 4 people: 22.50 each
      const current = { alice: 10, p1: 0, p2: 0, p3: 0, p4: 0 };
      const balanced = autoBalanceExactSplit(100, current, undefined, ["alice", "p1", "p2", "p3", "p4"]);
      expect(balanced["alice"]).toBe(10);
      const total = Object.values(balanced).reduce((a, b) => a + b, 0);
      expect(round2(total)).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // 4. INTEGRATION WITH TRIP BALANCE COMPUTATION
  // --------------------------------------------------------------------------
  describe("Integration: computeBalances with Advanced Splits", () => {
    it("correctly integrates itemized split expense into trip debts & balances", () => {
      const members: Member[] = [
        { id: "m_alice", name: "Alice", role: "owner", avatarColor: "#0F6B65" },
        { id: "m_bob", name: "Bob", role: "member", avatarColor: "#E39A2D" },
        { id: "m_carol", name: "Carol", role: "member", avatarColor: "#8B5CF6" },
      ];

      // Alice paid ₹1,500 upfront for an itemized dinner:
      // Item 1: Starters ₹600 (shared by all 3 = ₹200 each)
      // Item 2: Non-veg special ₹600 (only Alice and Bob = ₹300 each; Carol is vegetarian)
      // Item 3: Mocktails ₹300 (only Bob and Carol = ₹150 each)
      // Calculated splits:
      // Alice: 200 + 300 = ₹500
      // Bob: 200 + 300 + 150 = ₹650
      // Carol: 200 + 150 = ₹350
      // Sum = 500 + 650 + 350 = 1,500
      const items: ReceiptItem[] = [
        { id: "i1", title: "Starters", amount: 600, participants: ["m_alice", "m_bob", "m_carol"] },
        { id: "i2", title: "Non-veg Special", amount: 600, participants: ["m_alice", "m_bob"] },
        { id: "i3", title: "Mocktails", amount: 300, participants: ["m_bob", "m_carol"] },
      ];

      const { splits, totalAmount } = itemizedSplit(items, ["m_alice", "m_bob", "m_carol"]);

      const itemizedExpense: Expense = {
        id: "exp_itemized_1",
        title: "Itemized Restaurant Dinner",
        amount: totalAmount,
        category: "Food",
        date: "2026-09-28",
        paidBy: "m_alice",
        createdBy: "m_alice",
        method: "itemized",
        participants: ["m_alice", "m_bob", "m_carol"],
        items,
        splits,
      };

      const result = computeBalances(members, [itemizedExpense], []);

      // Alice paid ₹1,500 and her share was ₹500 => Alice net is +₹1,000
      expect(result.net["m_alice"]).toBe(1000);
      // Bob paid ₹0 and his share was ₹650 => Bob net is -₹650
      expect(result.net["m_bob"]).toBe(-650);
      // Carol paid ₹0 and her share was ₹350 => Carol net is -₹350
      expect(result.net["m_carol"]).toBe(-350);

      // Net balances must sum to exactly zero
      const netSum = round2(result.net["m_alice"] + result.net["m_bob"] + result.net["m_carol"]);
      expect(netSum).toBe(0);

      const debts = simplifyDebts(result.canonicalNet, members);
      // Debts should reflect that Bob owes Alice ₹650 and Carol owes Alice ₹350
      expect(debts.length).toBe(2);
      const bobDebt = debts.find((d) => d.from === "m_bob");
      const carolDebt = debts.find((d) => d.from === "m_carol");
      expect(bobDebt?.amount).toBe(650);
      expect(bobDebt?.to).toBe("m_alice");
      expect(carolDebt?.amount).toBe(350);
      expect(carolDebt?.to).toBe("m_alice");
    });
  });
});
