import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeBalances,
  equalSplit,
  percentageSplit,
  sharesSplit,
  simplifyDebts,
} from "./calculations";
import type { Expense, Member, Payment } from "../types";

const members: Member[] = [
  { id: "alice", name: "Alice", role: "owner", avatarColor: "#000" },
  { id: "bob", name: "Bob", role: "member", avatarColor: "#111" },
];

const sum = (values: Record<string, number>) =>
  Object.values(values).reduce((total, value) => total + value, 0);

test("equalSplit distributes cents exactly", () => {
  const result = equalSplit(10, ["alice", "bob", "charlie"]);
  assert.equal(sum(result), 10);
  assert.deepEqual(result, { alice: 3.34, bob: 3.33, charlie: 3.33 });
});

test("percentageSplit distributes the full amount", () => {
  const result = percentageSplit(100, { alice: 25, bob: 75 }, ["alice", "bob"]);
  assert.equal(sum(result), 100);
  assert.deepEqual(result, { alice: 25, bob: 75 });
});

test("sharesSplit uses integer share weights", () => {
  const result = sharesSplit(100, { alice: 2, bob: 1 }, ["alice", "bob"]);
  assert.equal(sum(result), 100);
  assert.deepEqual(result, { alice: 66.67, bob: 33.33 });
});

test("computeBalances ignores deleted expenses and applies confirmed payments", () => {
  const expense: Expense = {
    id: "expense-1",
    title: "Dinner",
    amount: 100,
    category: "Food",
    date: "2026-01-01",
    paidBy: "alice",
    createdBy: "alice",
    method: "equal",
    participants: ["alice", "bob"],
    splits: { alice: 50, bob: 50 },
  };
  const deleted = { ...expense, id: "expense-2", deleted: true };
  const payment: Payment = {
    id: "payment-1",
    tripId: "trip-1",
    from: "bob",
    to: "alice",
    amount: 50,
    status: "confirmed",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const result = computeBalances(members, [expense, deleted], [payment]);
  assert.deepEqual(result.paidShare, {
    alice: { paid: 100, share: 50 },
    bob: { paid: 0, share: 50 },
  });
  assert.deepEqual(result.net, { alice: 0, bob: 0 });
});

test("simplifyDebts creates a minimal transfer for one debtor and creditor", () => {
  const result = simplifyDebts({ alice: 75, bob: -75 });
  assert.equal(result.length, 1);
  assert.equal(result[0].from, "bob");
  assert.equal(result[0].to, "alice");
  assert.equal(result[0].amount, 75);
});
