import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import dotenv from "dotenv";
import {
  saveExpenseAtomic,
  recordPaymentAtomic,
  confirmPaymentAtomic,
} from "./storage";
import { Expense, Payment, Activity } from "../types";

dotenv.config();

const rawConn = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "").replace(/\?.*$/, "");

describe("Transaction Safety & Atomic Postgres RPC Stored Procedures", () => {
  const testTripId = `test_trip_atomic_${Date.now()}`;
  let pool: Pool;

  beforeAll(async () => {
    if (!rawConn) return;
    pool = new Pool({ connectionString: rawConn, ssl: { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      // Seed test trip
      await client.query(`
        INSERT INTO public.trips (id, title, currency, status, owner_id)
        VALUES ('${testTripId}', 'Atomic Concurrency Test Trip', 'INR', 'ACTIVE', 'u_owner_test')
        ON CONFLICT (id) DO NOTHING;
      `);

      // Seed test members
      await client.query(`
        INSERT INTO public.trip_members (id, trip_id, user_id, name, role)
        VALUES
          ('m_alice', '${testTripId}', 'u_owner_test', 'Alice', 'admin'),
          ('m_bob', '${testTripId}', 'u_member_1', 'Bob', 'participant'),
          ('m_carol', '${testTripId}', 'u_member_2', 'Carol', 'participant')
        ON CONFLICT (id) DO NOTHING;
      `);
    } finally {
      client.release();
    }
  }, 20000);

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM public.trips WHERE id = '${testTripId}';`);
    } finally {
      client.release();
      await pool.end();
    }
  }, 20000);

  it("atomically saves an expense and its activity audit log in a single transaction", async () => {
    const expenseId = `exp_atomic_${Date.now()}`;
    const activityId = `act_atomic_exp_${Date.now()}`;

    const newExpense: Expense = {
      id: expenseId,
      tripId: testTripId,
      title: "Group Dinner in Puri",
      amount: 4800,
      category: "Food",
      date: "2026-09-28",
      paidBy: "m_alice",
      createdBy: "u_owner_test",
      method: "equal",
      participants: ["m_alice", "m_bob"],
      splits: { m_alice: 2400, m_bob: 2400 },
    };

    const newActivity: Activity = {
      id: activityId,
      ts: "Just now",
      user: "Alice",
      action: "added expense",
      detail: "Alice added Group Dinner in Puri — ₹4,800",
      actorId: "m_alice",
    };

    await saveExpenseAtomic(testTripId, newExpense, newActivity);

    // Verify expense in Supabase via pool
    const expRes = await pool.query(`SELECT * FROM public.expenses WHERE id = $1;`, [expenseId]);
    expect(expRes.rows.length).toBe(1);
    const expRow = expRes.rows[0];
    expect(expRow.title).toBe("Group Dinner in Puri");
    expect(Number(expRow.amount)).toBe(4800);

    // Verify activity was inserted atomically
    const actRes = await pool.query(`SELECT * FROM public.activities WHERE id = $1;`, [activityId]);
    expect(actRes.rows.length).toBe(1);
    const actRow = actRes.rows[0];
    expect(actRow.user_name).toBe("Alice");
    expect(actRow.action).toBe("added expense");
  }, 20000);

  it("atomically records a settlement payment and activity audit log", async () => {
    const paymentId = `pay_atomic_${Date.now()}`;
    const activityId = `act_atomic_pay_${Date.now()}`;

    const payment: Payment = {
      id: paymentId,
      settlementId: paymentId,
      tripId: testTripId,
      from: "m_bob",
      to: "m_alice",
      fromUserId: "m_bob",
      toUserId: "m_alice",
      amount: 2400,
      currency: "INR",
      status: "pending_confirmation",
      method: "UPI",
      ts: "Just now",
      note: "Dinner split settlement",
      createdAt: new Date().toISOString(),
    };

    const activity: Activity = {
      id: activityId,
      ts: "Just now",
      user: "Bob",
      action: "recorded payment",
      detail: "Bob recorded payment of ₹2,400 to Alice via UPI",
      actorId: "m_bob",
    };

    await recordPaymentAtomic(testTripId, payment, activity);

    // Verify payment record
    const payRes = await pool.query(`SELECT * FROM public.payments WHERE id = $1;`, [paymentId]);
    expect(payRes.rows.length).toBe(1);
    const payRow = payRes.rows[0];
    expect(Number(payRow.amount)).toBe(2400);
    expect(payRow.status).toBe("pending_confirmation");
    expect(payRow.from_member_id).toBe("m_bob");
    expect(payRow.to_member_id).toBe("m_alice");

    // Verify activity record
    const actRes = await pool.query(`SELECT * FROM public.activities WHERE id = $1;`, [activityId]);
    expect(actRes.rows.length).toBe(1);
    const actRow = actRes.rows[0];
    expect(actRow.user_name).toBe("Bob");
  }, 20000);

  it("atomically confirms a payment and logs the confirmation activity", async () => {
    // Record payment first
    const paymentId = `pay_confirm_${Date.now()}`;
    const payActId = `act_pay_${Date.now()}`;
    const confirmActId = `act_confirm_${Date.now()}`;

    const payment: Payment = {
      id: paymentId,
      settlementId: paymentId,
      tripId: testTripId,
      from: "m_carol",
      to: "m_alice",
      fromUserId: "m_carol",
      toUserId: "m_alice",
      amount: 1200,
      currency: "INR",
      status: "pending_confirmation",
      method: "Cash",
      createdAt: new Date().toISOString(),
    };

    await recordPaymentAtomic(testTripId, payment, {
      id: payActId,
      ts: "Just now",
      user: "Carol",
      action: "recorded payment",
      detail: "Carol paid Alice ₹1,200",
    });

    // Confirm atomically
    await confirmPaymentAtomic(testTripId, paymentId, "m_alice", {
      id: confirmActId,
      ts: "Just now",
      user: "Alice",
      action: "confirmed settlement",
      detail: "Alice confirmed payment of ₹1,200 from Carol",
    });

    const payRes = await pool.query(`SELECT * FROM public.payments WHERE id = $1;`, [paymentId]);
    expect(payRes.rows.length).toBe(1);
    const confirmedPayRow = payRes.rows[0];
    expect(confirmedPayRow.status).toBe("confirmed");
    expect(confirmedPayRow.confirmed_by).toBe("m_alice");
    expect(confirmedPayRow.confirmed_at).not.toBeNull();
  }, 20000);

  it("handles concurrent settlements without deadlocks or missing records", async () => {
    const promises = Array.from({ length: 5 }).map((_, i) => {
      const pid = `pay_concurrent_${Date.now()}_${i}`;
      const payment: Payment = {
        id: pid,
        tripId: testTripId,
        from: "m_bob",
        to: "m_alice",
        amount: 100 + i * 10,
        status: "confirmed",
        method: "Cash",
        createdAt: new Date().toISOString(),
      };
      return recordPaymentAtomic(testTripId, payment, {
        id: `act_concurrent_${Date.now()}_${i}`,
        ts: "Just now",
        user: "Bob",
        action: "recorded payment",
        detail: `Concurrent payment ${i}`,
      });
    });

    // Run 5 simultaneous concurrent settlements
    await expect(Promise.all(promises)).resolves.not.toThrow();

    // Verify all 5 payments exist
    const payRes = await pool.query(`SELECT id FROM public.payments WHERE trip_id = $1 AND id LIKE 'pay_concurrent_%';`, [testTripId]);
    expect(payRes.rows.length).toBe(5);
  });
});
