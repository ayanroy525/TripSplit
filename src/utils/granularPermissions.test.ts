import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  normalizeRole,
  getRoleDisplayName,
  getUserRoleInTrip,
  isExpenseOwnedByUser,
  getTripPermissions,
} from "./permissions";
import { Trip, Member, Expense, Payment } from "../types";
import { Pool } from "pg";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const rawConn = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "").replace(/\?.*$/, "");

describe("Granular Member Roles & Permissions Model", () => {
  // Mock trip with 3 members representing each role
  const mockTrip: Trip = {
    id: "trip_perm_test",
    title: "Goa Vacation",
    location: "Goa, India",
    destination: "Goa, India",
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    currency: "INR",
    status: "ACTIVE",
    ownerId: "u_admin",
    ownerName: "Alice Admin",
    inviteCode: "TRIP-GOA99",
    members: [
      { id: "m_admin", userId: "u_admin", name: "Alice Admin", role: "admin", avatarColor: "#0F6B65" },
      { id: "m_part", userId: "u_part", name: "Bob Participant", role: "participant", avatarColor: "#E39A2D" },
      { id: "m_viewer", userId: "u_viewer", name: "Charlie Viewer", role: "viewer", avatarColor: "#8B5CF6" },
    ],
    expenses: [],
    payments: [],
    activities: [],
    createdAt: new Date().toISOString(),
  };

  const adminExpense: Expense = {
    id: "exp_admin_1",
    title: "Resort Stay",
    amount: 15000,
    category: "Accommodation",
    date: "2026-10-01",
    paidBy: "m_admin",
    createdBy: "u_admin",
    method: "equal",
    participants: ["m_admin", "m_part", "m_viewer"],
    splits: { m_admin: 5000, m_part: 5000, m_viewer: 5000 },
  };

  const participantExpense: Expense = {
    id: "exp_part_1",
    title: "Beachside Dinner",
    amount: 3000,
    category: "Food",
    date: "2026-10-02",
    paidBy: "m_part",
    createdBy: "u_part",
    method: "equal",
    participants: ["m_admin", "m_part"],
    splits: { m_admin: 1500, m_part: 1500 },
  };

  // --------------------------------------------------------------------------
  // 1. ROLE NORMALIZATION & DISPLAY
  // --------------------------------------------------------------------------
  describe("Role Normalization & Display Labels", () => {
    it("normalizes canonical and legacy role strings correctly", () => {
      expect(normalizeRole("admin")).toBe("admin");
      expect(normalizeRole("owner")).toBe("admin");
      expect(normalizeRole("ADMIN")).toBe("admin");
      expect(normalizeRole("participant")).toBe("participant");
      expect(normalizeRole("member")).toBe("participant");
      expect(normalizeRole("viewer")).toBe("viewer");
      expect(normalizeRole(undefined)).toBe("participant");
      expect(normalizeRole(null)).toBe("participant");
    });

    it("returns clean user-facing display names", () => {
      expect(getRoleDisplayName("admin")).toBe("Admin");
      expect(getRoleDisplayName("owner")).toBe("Admin");
      expect(getRoleDisplayName("participant")).toBe("Participant");
      expect(getRoleDisplayName("member")).toBe("Participant");
      expect(getRoleDisplayName("viewer")).toBe("Viewer");
    });

    it("correctly identifies trip owner as admin", () => {
      expect(getUserRoleInTrip(mockTrip, "u_admin")).toBe("admin");
      expect(getUserRoleInTrip(mockTrip, "u_part")).toBe("participant");
      expect(getUserRoleInTrip(mockTrip, "u_viewer")).toBe("viewer");
      expect(getUserRoleInTrip(mockTrip, "u_stranger")).toBe("viewer");
    });
  });

  // --------------------------------------------------------------------------
  // 2. EXPENSE OWNERSHIP CHECK
  // --------------------------------------------------------------------------
  describe("Expense Ownership Detection", () => {
    it("identifies owner by createdBy or paidBy (userId or memberId)", () => {
      expect(isExpenseOwnedByUser(adminExpense, "u_admin", mockTrip)).toBe(true);
      expect(isExpenseOwnedByUser(adminExpense, "m_admin", mockTrip)).toBe(true);
      expect(isExpenseOwnedByUser(adminExpense, "u_part", mockTrip)).toBe(false);

      expect(isExpenseOwnedByUser(participantExpense, "u_part", mockTrip)).toBe(true);
      expect(isExpenseOwnedByUser(participantExpense, "m_part", mockTrip)).toBe(true);
      expect(isExpenseOwnedByUser(participantExpense, "u_admin", mockTrip)).toBe(false);
      expect(isExpenseOwnedByUser(participantExpense, "u_viewer", mockTrip)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. TRIP ADMIN PERMISSIONS
  // --------------------------------------------------------------------------
  describe("Trip Admin Permissions", () => {
    const adminPerms = getTripPermissions(mockTrip, mockTrip.members[0], "u_admin");

    it("admin has full administrative flags", () => {
      expect(adminPerms.role).toBe("admin");
      expect(adminPerms.isAdmin).toBe(true);
      expect(adminPerms.isParticipant).toBe(false);
      expect(adminPerms.isViewer).toBe(false);
      expect(adminPerms.displayName).toBe("Admin");
    });

    it("admin can add expenses", () => {
      expect(adminPerms.canAddExpense).toBe(true);
    });

    it("admin can edit own expenses AND other members' expenses", () => {
      expect(adminPerms.canEditExpense(adminExpense)).toBe(true);
      expect(adminPerms.canEditExpense(participantExpense)).toBe(true);
    });

    it("admin can delete own expenses AND other members' expenses", () => {
      expect(adminPerms.canDeleteExpense(adminExpense)).toBe(true);
      expect(adminPerms.canDeleteExpense(participantExpense)).toBe(true);
    });

    it("admin can invite and add members", () => {
      expect(adminPerms.canInviteMember).toBe(true);
    });

    it("admin can remove members (except original trip owner)", () => {
      expect(adminPerms.canRemoveMember("m_part")).toBe(true);
      expect(adminPerms.canRemoveMember("m_viewer")).toBe(true);
      // Cannot remove trip owner
      expect(adminPerms.canRemoveMember("m_admin")).toBe(false);
    });

    it("admin can change member roles", () => {
      expect(adminPerms.canChangeRole).toBe(true);
    });

    it("admin can manage trip settings and delete trip", () => {
      expect(adminPerms.canManageTripSettings).toBe(true);
      expect(adminPerms.canDeleteTrip).toBe(true);
    });

    it("admin can record, confirm, and cancel payments", () => {
      expect(adminPerms.canRecordPayment).toBe(true);
      expect(adminPerms.canConfirmPayment("m_part", "u_part")).toBe(true);
      expect(adminPerms.canCancelPayment("m_part", "u_part", "m_admin", "u_admin")).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. PARTICIPANT PERMISSIONS
  // --------------------------------------------------------------------------
  describe("Participant Permissions", () => {
    const partPerms = getTripPermissions(mockTrip, mockTrip.members[1], "u_part");

    it("participant has proper flags", () => {
      expect(partPerms.role).toBe("participant");
      expect(partPerms.isAdmin).toBe(false);
      expect(partPerms.isParticipant).toBe(true);
      expect(partPerms.isViewer).toBe(false);
      expect(partPerms.displayName).toBe("Participant");
    });

    it("participant can add expenses", () => {
      expect(partPerms.canAddExpense).toBe(true);
    });

    it("participant can edit and delete OWN expense", () => {
      expect(partPerms.canEditExpense(participantExpense)).toBe(true);
      expect(partPerms.canDeleteExpense(participantExpense)).toBe(true);
    });

    it("participant CANNOT edit another member's expense", () => {
      expect(partPerms.canEditExpense(adminExpense)).toBe(false);
    });

    it("participant CANNOT delete another member's expense", () => {
      expect(partPerms.canDeleteExpense(adminExpense)).toBe(false);
    });

    it("participant CAN invite new members", () => {
      expect(partPerms.canInviteMember).toBe(true);
    });

    it("participant CANNOT remove members", () => {
      expect(partPerms.canRemoveMember("m_viewer")).toBe(false);
      expect(partPerms.canRemoveMember("m_part")).toBe(false);
    });

    it("participant CANNOT change member roles", () => {
      expect(partPerms.canChangeRole).toBe(false);
    });

    it("participant CANNOT change trip settings or delete trip", () => {
      expect(partPerms.canManageTripSettings).toBe(false);
      expect(partPerms.canDeleteTrip).toBe(false);
    });

    it("participant can record payments and manage payments where involved", () => {
      expect(partPerms.canRecordPayment).toBe(true);
      // Can confirm if recipient
      expect(partPerms.canConfirmPayment("m_part", "u_part")).toBe(true);
      // Cannot confirm if someone else is recipient
      expect(partPerms.canConfirmPayment("m_admin", "u_admin")).toBe(false);
      // Can cancel if debtor or recipient
      expect(partPerms.canCancelPayment("m_part", "u_part", "m_admin", "u_admin")).toBe(true);
      // Cannot cancel unrelated payment
      expect(partPerms.canCancelPayment("m_admin", "u_admin", "m_viewer", "u_viewer")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5. VIEWER PERMISSIONS
  // --------------------------------------------------------------------------
  describe("Viewer Permissions", () => {
    const viewerPerms = getTripPermissions(mockTrip, mockTrip.members[2], "u_viewer");

    it("viewer has read-only flags", () => {
      expect(viewerPerms.role).toBe("viewer");
      expect(viewerPerms.isAdmin).toBe(false);
      expect(viewerPerms.isParticipant).toBe(false);
      expect(viewerPerms.isViewer).toBe(true);
      expect(viewerPerms.displayName).toBe("Viewer");
    });

    it("viewer CANNOT add expenses", () => {
      expect(viewerPerms.canAddExpense).toBe(false);
    });

    it("viewer CANNOT edit any expenses", () => {
      expect(viewerPerms.canEditExpense(adminExpense)).toBe(false);
      expect(viewerPerms.canEditExpense(participantExpense)).toBe(false);
    });

    it("viewer CANNOT delete any expenses", () => {
      expect(viewerPerms.canDeleteExpense(adminExpense)).toBe(false);
      expect(viewerPerms.canDeleteExpense(participantExpense)).toBe(false);
    });

    it("viewer CANNOT invite members", () => {
      expect(viewerPerms.canInviteMember).toBe(false);
    });

    it("viewer CANNOT remove members", () => {
      expect(viewerPerms.canRemoveMember("m_part")).toBe(false);
    });

    it("viewer CANNOT change member roles", () => {
      expect(viewerPerms.canChangeRole).toBe(false);
    });

    it("viewer CANNOT change trip settings or delete trip", () => {
      expect(viewerPerms.canManageTripSettings).toBe(false);
      expect(viewerPerms.canDeleteTrip).toBe(false);
    });

    it("viewer CANNOT record or modify payments", () => {
      expect(viewerPerms.canRecordPayment).toBe(false);
      expect(viewerPerms.canConfirmPayment("m_viewer", "u_viewer")).toBe(false);
      expect(viewerPerms.canCancelPayment("m_viewer", "u_viewer", "m_admin", "u_admin")).toBe(false);
    });
  });
});

// ------------------------------------------------------------------------------
// 6. LIVE POSTGRESQL & SUPABASE RLS SECURITY & IDOR ENFORCEMENT TESTS
// ------------------------------------------------------------------------------
describe("Live Database RLS Security & IDOR Prevention", () => {
  let pool: Pool;
  const tripA = `trip_sec_a_${Date.now()}`;
  const tripB = `trip_sec_b_${Date.now()}`;
  const userAdmin = crypto.randomUUID();
  const userPart = crypto.randomUUID();
  const userViewer = crypto.randomUUID();
  const userStranger = crypto.randomUUID();

  const expAdminId = `exp_sec_admin_${Date.now()}`;
  const expPartId = `exp_sec_part_${Date.now()}`;

  beforeAll(async () => {
    if (!rawConn) return;
    pool = new Pool({ connectionString: rawConn, ssl: { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      // 1. Seed Trip A
      await client.query(`
        INSERT INTO public.trips (id, title, currency, owner_id)
        VALUES ('${tripA}', 'Trip A Secure', 'INR', '${userAdmin}');
      `);

      // 2. Seed members in Trip A
      await client.query(`
        INSERT INTO public.trip_members (id, trip_id, user_id, name, role)
        VALUES
          ('m_sec_admin', '${tripA}', '${userAdmin}', 'Admin Alice', 'admin'),
          ('m_sec_part', '${tripA}', '${userPart}', 'Part Bob', 'participant'),
          ('m_sec_viewer', '${tripA}', '${userViewer}', 'View Charlie', 'viewer');
      `);

      // 3. Seed Trip B (Unrelated private trip)
      await client.query(`
        INSERT INTO public.trips (id, title, currency, owner_id)
        VALUES ('${tripB}', 'Trip B Secret', 'INR', '${userStranger}');

        INSERT INTO public.trip_members (id, trip_id, user_id, name, role)
        VALUES ('m_sec_stranger', '${tripB}', '${userStranger}', 'Stranger Dan', 'admin');
      `);

      // 4. Seed expenses in Trip A
      await client.query(`
        INSERT INTO public.expenses (id, trip_id, title, amount, paid_by, created_by, method, participants, splits)
        VALUES
          ('${expAdminId}', '${tripA}', 'Admin Expense', 2000, 'm_sec_admin', '${userAdmin}', 'equal', '["m_sec_admin","m_sec_part"]'::jsonb, '{"m_sec_admin":1000,"m_sec_part":1000}'::jsonb),
          ('${expPartId}', '${tripA}', 'Part Expense', 1000, 'm_sec_part', '${userPart}', 'equal', '["m_sec_admin","m_sec_part"]'::jsonb, '{"m_sec_admin":500,"m_sec_part":500}'::jsonb);
      `);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM public.trips WHERE id IN ('${tripA}', '${tripB}');`);
    } finally {
      client.release();
      await pool.end();
    }
  });

  // Helper to execute query as a simulated authenticated user under RLS
  async function runAsUser(userId: string | null, sql: string): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");
      if (userId) {
        await client.query(`SET LOCAL "request.jwt.claim.sub" = '${userId}';`);
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userId}", "role": "authenticated"}';`);
        await client.query(`SET LOCAL ROLE authenticated;`);
      } else {
        await client.query(`SET LOCAL ROLE anon;`);
      }
      const res = await client.query(sql);
      await client.query("COMMIT;");
      return res;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  it("Non-member / Stranger from Trip B cannot view Trip A expenses", async () => {
    if (!pool) return;
    const res = await runAsUser(userStranger, `SELECT * FROM public.expenses WHERE trip_id = '${tripA}';`);
    expect(res.rows.length).toBe(0);
  });

  it("Logged-out (anon) user cannot access protected trip data", async () => {
    if (!pool) return;
    const res = await runAsUser(null, `SELECT * FROM public.expenses WHERE trip_id = '${tripA}';`);
    expect(res.rows.length).toBe(0);
  });

  it("Participant CANNOT update another member's expense (IDOR rejected)", async () => {
    if (!pool) return;
    // Attempting to update Admin's expense as Participant
    const res = await runAsUser(
      userPart,
      `UPDATE public.expenses SET title = 'Hacked by Participant' WHERE id = '${expAdminId}';`
    );
    // RLS policy prevents update on non-owned expense (0 rows updated)
    expect(res.rowCount).toBe(0);

    // Verify title was NOT changed
    const verify = await pool.query(`SELECT title FROM public.expenses WHERE id = '${expAdminId}';`);
    expect(verify.rows[0].title).toBe("Admin Expense");
  });

  it("Participant CANNOT delete another member's expense (IDOR rejected)", async () => {
    if (!pool) return;
    const res = await runAsUser(
      userPart,
      `DELETE FROM public.expenses WHERE id = '${expAdminId}';`
    );
    expect(res.rowCount).toBe(0);

    const verify = await pool.query(`SELECT id FROM public.expenses WHERE id = '${expAdminId}';`);
    expect(verify.rows.length).toBe(1);
  });

  it("Participant CAN update their OWN expense", async () => {
    if (!pool) return;
    const res = await runAsUser(
      userPart,
      `UPDATE public.expenses SET title = 'Legitimate Part Edit' WHERE id = '${expPartId}';`
    );
    expect(res.rowCount).toBe(1);
  });

  it("Participant CANNOT promote themselves or change roles to admin in database (Trigger Enforced)", async () => {
    if (!pool) return;
    let failed = false;
    try {
      await runAsUser(
        userPart,
        `UPDATE public.trip_members SET role = 'admin' WHERE user_id = '${userPart}';`
      );
    } catch (err: any) {
      failed = true;
      expect(err.message).toMatch(/Permission Denied|permission/i);
    }
    expect(failed).toBe(true);

    // Verify role is still participant
    const verify = await pool.query(`SELECT role FROM public.trip_members WHERE user_id = '${userPart}';`);
    expect(verify.rows[0].role).toBe("participant");
  });

  it("Participant CANNOT remove another member from trip", async () => {
    if (!pool) return;
    const res = await runAsUser(
      userPart,
      `DELETE FROM public.trip_members WHERE user_id = '${userViewer}';`
    );
    expect(res.rowCount).toBe(0);

    const verify = await pool.query(`SELECT id FROM public.trip_members WHERE user_id = '${userViewer}';`);
    expect(verify.rows.length).toBe(1);
  });

  it("Participant CANNOT modify trip settings (trips UPDATE rejected)", async () => {
    if (!pool) return;
    const res = await runAsUser(
      userPart,
      `UPDATE public.trips SET title = 'Hacked Trip Title' WHERE id = '${tripA}';`
    );
    expect(res.rowCount).toBe(0);

    const verify = await pool.query(`SELECT title FROM public.trips WHERE id = '${tripA}';`);
    expect(verify.rows[0].title).toBe("Trip A Secure");
  });

  it("Viewer CANNOT insert an expense", async () => {
    if (!pool) return;
    let failed = false;
    try {
      await runAsUser(
        userViewer,
        `INSERT INTO public.expenses (id, trip_id, title, amount, paid_by, created_by, method, participants, splits)
         VALUES ('exp_viewer_attempt', '${tripA}', 'Viewer Bill', 500, 'm_sec_viewer', '${userViewer}', 'equal', '["m_sec_viewer"]'::jsonb, '{"m_sec_viewer":500}'::jsonb);`
      );
    } catch (err: any) {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it("Viewer CANNOT update or delete any expense", async () => {
    if (!pool) return;
    const updateRes = await runAsUser(
      userViewer,
      `UPDATE public.expenses SET title = 'Viewer Edit' WHERE id = '${expPartId}';`
    );
    expect(updateRes.rowCount).toBe(0);

    const deleteRes = await runAsUser(
      userViewer,
      `DELETE FROM public.expenses WHERE id = '${expPartId}';`
    );
    expect(deleteRes.rowCount).toBe(0);
  });

  it("Admin CAN edit and delete other members' expenses", async () => {
    if (!pool) return;
    const updateRes = await runAsUser(
      userAdmin,
      `UPDATE public.expenses SET title = 'Admin Authorized Override' WHERE id = '${expPartId}';`
    );
    expect(updateRes.rowCount).toBe(1);

    const deleteRes = await runAsUser(
      userAdmin,
      `DELETE FROM public.expenses WHERE id = '${expPartId}';`
    );
    expect(deleteRes.rowCount).toBe(1);
  });

  it("Admin CAN change member roles and remove members", async () => {
    if (!pool) return;
    // Admin changes viewer to participant
    const roleRes = await runAsUser(
      userAdmin,
      `UPDATE public.trip_members SET role = 'participant' WHERE user_id = '${userViewer}';`
    );
    expect(roleRes.rowCount).toBe(1);

    // Admin removes member
    const delMemRes = await runAsUser(
      userAdmin,
      `DELETE FROM public.trip_members WHERE user_id = '${userViewer}';`
    );
    expect(delMemRes.rowCount).toBe(1);
  });
});
