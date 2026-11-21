import {
  pool,
  verifyAuthRequest,
  checkTripAuthorization,
  sanitizeReceiptUrl,
  setCorsHeaders,
  sendJson,
  parseBody,
  getLocalStore,
  saveLocalStore,
  generateSecureInviteCode,
  getDefaultInviteExpiryIso,
  getClientIp,
  logSecurityEvent,
  safeIdSchema,
  amountSchema,
  splitMethodSchema,
  currencySchema,
} from "../_shared.js";
import { z } from "zod";

const allowedMutationTypes = new Set([
  "RECORD_PAYMENT",
  "DELETE_PAYMENT",
  "SAVE_EXPENSE",
  "DELETE_EXPENSE",
  "SAVE_MEMBER",
  "DELETE_MEMBER",
  "SAVE_ACTIVITY",
  "SAVE_TRIP_SNAPSHOT",
  "DELETE_TRIP",
]);

const memberRoleAllowlist = new Set(["owner", "admin", "member", "participant", "editor", "viewer"]);
const memberStatusAllowlist = new Set(["accepted", "pending", "invited", "active", "removed"]);
const paymentStatusAllowlist = new Set(["pending", "confirmed", "cancelled", "completed", "settled"]);

function validateMutationPayload(type: string, payload: any): string | null {
  if (type === "DELETE_TRIP") return null;
  if (!payload || typeof payload !== "object") {
    return "Mutation payload must be a valid object";
  }
  if (type === "SAVE_EXPENSE") {
    if (!payload.id || !safeIdSchema.safeParse(String(payload.id)).success) {
      return "Valid expense id is required";
    }
    if (payload.title !== undefined && (typeof payload.title !== "string" || payload.title.trim().length === 0 || payload.title.trim().length > 160)) {
      return "Expense title must be between 1 and 160 characters";
    }
    const numAmount = typeof payload.amount === "number" ? payload.amount : Number(payload.amount);
    if (payload.amount === undefined || payload.amount === null || typeof payload.amount === "boolean" || !amountSchema.safeParse(numAmount).success) {
      return "Expense amount must be a valid number between 0 and 100,000,000";
    }
    if (payload.method !== undefined && !splitMethodSchema.safeParse(payload.method).success) {
      return "Invalid split method";
    }
    if (payload.notes !== undefined && payload.notes !== null && String(payload.notes).length > 1000) {
      return "Expense notes cannot exceed 1000 characters";
    }
  } else if (type === "DELETE_EXPENSE") {
    const expId = payload.expenseId || payload.id;
    if (!expId || !safeIdSchema.safeParse(String(expId)).success) {
      return "Valid expenseId is required";
    }
  } else if (type === "RECORD_PAYMENT") {
    if (!payload.id || !safeIdSchema.safeParse(String(payload.id)).success) {
      return "Valid payment id is required";
    }
    if (payload.amount !== undefined && payload.amount !== null) {
      const numAmount = typeof payload.amount === "number" ? payload.amount : Number(payload.amount);
      if (typeof payload.amount === "boolean" || !amountSchema.safeParse(numAmount).success) {
        return "Payment amount must be a valid number between 0 and 100,000,000";
      }
    }
    if (payload.status !== undefined && !paymentStatusAllowlist.has(String(payload.status).toLowerCase())) {
      return "Invalid payment status";
    }
    if (payload.note !== undefined && payload.note !== null && String(payload.note).length > 500) {
      return "Payment note cannot exceed 500 characters";
    }
  } else if (type === "DELETE_PAYMENT") {
    const payId = payload.paymentId || payload.id;
    if (!payId || !safeIdSchema.safeParse(String(payId)).success) {
      return "Valid paymentId is required";
    }
  } else if (type === "SAVE_MEMBER") {
    const memId = payload.id || payload.userId;
    if (memId !== undefined && !safeIdSchema.safeParse(String(memId)).success) {
      return "Invalid member id format";
    }
    if (payload.name !== undefined && (typeof payload.name !== "string" || payload.name.trim().length === 0 || payload.name.trim().length > 100)) {
      return "Member name must be between 1 and 100 characters";
    }
    if (payload.role !== undefined && !memberRoleAllowlist.has(String(payload.role).toLowerCase())) {
      return "Invalid member role";
    }
    if (payload.status !== undefined && !memberStatusAllowlist.has(String(payload.status).toLowerCase())) {
      return "Invalid member status";
    }
    if (payload.email !== undefined && payload.email !== null && String(payload.email).trim() !== "") {
      if (!z.string().email().max(160).safeParse(String(payload.email).trim()).success) {
        return "Invalid member email address";
      }
    }
  } else if (type === "DELETE_MEMBER") {
    const memId = payload.memberId || payload.id;
    if (!memId || !safeIdSchema.safeParse(String(memId)).success) {
      return "Valid memberId is required";
    }
  } else if (type === "SAVE_ACTIVITY") {
    if (!payload.id || !safeIdSchema.safeParse(String(payload.id)).success) {
      return "Valid activity id is required";
    }
    if (payload.detail !== undefined && payload.detail !== null && String(payload.detail).length > 1000) {
      return "Activity detail cannot exceed 1000 characters";
    }
  } else if (type === "SAVE_TRIP_SNAPSHOT") {
    const title = payload.title ?? payload.name;
    if (title !== undefined && (typeof title !== "string" || title.trim().length === 0 || title.trim().length > 160)) {
      return "Trip title must be between 1 and 160 characters";
    }
    if (payload.currency !== undefined && !currencySchema.safeParse(payload.currency).success) {
      return "Invalid currency code";
    }
  }
  return null;
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method Not Allowed" });
  }

  const authResult = await verifyAuthRequest(req);
  if (!authResult.authorized || !authResult.userId) {
    return sendJson(res, authResult.statusCode || 401, {
      success: false,
      error: authResult.error || "Authentication required",
    });
  }

  const userId = authResult.userId;
  const clientIp = getClientIp(req);
  const body = parseBody(req);
  const { type, tripId, payload } = body || {};

  if (!type || !tripId) {
    return sendJson(res, 400, { success: false, error: "type and tripId are required" });
  }
  if (typeof type !== "string" || !allowedMutationTypes.has(type)) {
    return sendJson(res, 400, { success: false, error: "Invalid mutation type" });
  }
  if (typeof tripId !== "string" || !safeIdSchema.safeParse(tripId).success) {
    return sendJson(res, 400, { success: false, error: "Invalid tripId format" });
  }
  const payloadErr = validateMutationPayload(type, payload);
  if (payloadErr) {
    return sendJson(res, 400, { success: false, error: payloadErr });
  }

  if (process.env.NODE_ENV === "production" && !pool) {
    return sendJson(res, 503, { success: false, error: "Database unavailable" });
  }

  // Authorization check: Verify user is a member of this trip (or creating a genuinely new trip where they are owner)
  let tripExists = false;
  if (pool) {
    try {
      const existsRes = await pool.query("SELECT id FROM public.trips WHERE id = $1 LIMIT 1;", [tripId]);
      tripExists = existsRes.rows.length > 0;
    } catch {
      if (process.env.NODE_ENV === "production") {
        return sendJson(res, 503, { success: false, error: "Database unavailable" });
      }
    }
  } else {
    const store = getLocalStore();
    tripExists = store.trips.some((t: any) => t.id === tripId);
  }

  let isTripAdmin = false;
  if (type === "SAVE_TRIP_SNAPSHOT" && !tripExists) {
    if (payload?.id && payload.id !== tripId) {
      return sendJson(res, 400, { success: false, error: "Trip ID mismatch in snapshot payload." });
    }
    if (payload?.ownerId && payload.ownerId !== userId) {
      logSecurityEvent("PERMISSION_DENIED", {
        scope: "mutation-create-trip-owner-mismatch",
        userId,
        tripId,
        type,
        ip: clientIp,
      });
      return sendJson(res, 403, { success: false, error: "Access denied: Cannot create a trip owned by another user." });
    }
    isTripAdmin = true;
  } else {
    const authCheck = await checkTripAuthorization(tripId, userId, pool);
    if (!authCheck.canAccess) {
      logSecurityEvent("PERMISSION_DENIED", {
        scope: "mutation-trip-access",
        userId,
        tripId,
        type,
        ip: clientIp,
      });
      return sendJson(res, 403, {
        success: false,
        error: "Access denied: You are not an authorized member of this trip.",
      });
    }
    if (type === "DELETE_TRIP" && !authCheck.isOwner) {
      logSecurityEvent("PERMISSION_DENIED", {
        scope: "mutation-delete-trip-non-owner",
        userId,
        tripId,
        type,
        ip: clientIp,
      });
      return sendJson(res, 403, {
        success: false,
        error: "Access denied: Only the trip owner can delete this trip.",
      });
    }
    if (authCheck.role === "viewer") {
      logSecurityEvent("PERMISSION_DENIED", {
        scope: "mutation-viewer-write",
        userId,
        tripId,
        type,
        ip: clientIp,
      });
      return sendJson(res, 403, {
        success: false,
        error: "Access denied: Viewers have read-only access to this trip.",
      });
    }
    isTripAdmin = Boolean(authCheck.isOwner || authCheck.role === "admin" || authCheck.role === "owner");

    // Participant-level RBAC enforcement
    if (!isTripAdmin) {
      if (type === "DELETE_MEMBER") {
        logSecurityEvent("PERMISSION_DENIED", {
          scope: "mutation-delete-member",
          userId,
          tripId,
          type,
          ip: clientIp,
        });
        return sendJson(res, 403, {
          success: false,
          error: "Access denied: Only trip admins can remove members.",
        });
      }
      if (type === "SAVE_MEMBER") {
        const requestedRole = String(payload?.role || "").toLowerCase();
        if (requestedRole === "admin" || requestedRole === "owner") {
          logSecurityEvent("PERMISSION_DENIED", {
            scope: "mutation-promote-member",
            userId,
            tripId,
            type,
            ip: clientIp,
          });
          return sendJson(res, 403, {
            success: false,
            error: "Access denied: Participants cannot promote members to admin.",
          });
        }
      }
      if ((type === "SAVE_EXPENSE" || type === "DELETE_EXPENSE") && pool) {
        const targetExpenseId = type === "DELETE_EXPENSE" ? (payload?.expenseId || payload?.id) : payload?.id;
        if (targetExpenseId) {
          const existingExpRes = await pool.query(
            `SELECT e.created_by, e.paid_by,
                    EXISTS (
                      SELECT 1 FROM public.trip_members tm
                      WHERE tm.trip_id = e.trip_id
                        AND (tm.user_id = $2 OR tm.id = $2)
                        AND (tm.id = e.paid_by OR tm.id = e.created_by)
                    ) AS is_member_owner
             FROM public.expenses e
             WHERE e.id = $1 AND e.trip_id = $3
             LIMIT 1;`,
            [targetExpenseId, userId, tripId]
          );
          if (existingExpRes.rows.length > 0) {
            const row = existingExpRes.rows[0];
            const isExpenseOwner =
              row.created_by === userId ||
              row.paid_by === userId ||
              Boolean(row.is_member_owner);
            if (!isExpenseOwner) {
              logSecurityEvent("PERMISSION_DENIED", {
                scope: "mutation-modify-others-expense",
                userId,
                tripId,
                type,
                ip: clientIp,
              });
              return sendJson(res, 403, {
                success: false,
                error: "Access denied: Participants can only edit or delete their own expenses.",
              });
            }
          }
        }
      }
    }
  }

  if (pool) {
    try {
      switch (type) {
        case "RECORD_PAYMENT": {
          const payment = payload;
          if (payment && payment.id) {
            if (payment.status && (!payment.amount || !payment.from)) {
              await pool.query(
                `UPDATE public.payments
                 SET status = $1,
                     confirmed_by = COALESCE($2, confirmed_by),
                     confirmed_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE confirmed_at END,
                     cancelled_by = COALESCE($3, cancelled_by),
                     cancelled_at = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE cancelled_at END,
                     updated_at = NOW()
                 WHERE id = $4 AND trip_id = $5;`,
                [payment.status, payment.confirmedBy || null, payment.cancelledBy || null, payment.id, tripId]
              );
            } else {
              await pool.query(
                `INSERT INTO public.payments (
                  id, trip_id, from_member_id, to_member_id, from_user_id, to_user_id,
                  amount, status, method, note, original_amount, original_currency, exchange_rate,
                  audit_logs, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET
                  from_member_id = EXCLUDED.from_member_id,
                  to_member_id = EXCLUDED.to_member_id,
                  amount = EXCLUDED.amount,
                  status = EXCLUDED.status,
                  method = EXCLUDED.method,
                  note = EXCLUDED.note,
                  audit_logs = EXCLUDED.audit_logs,
                  updated_at = NOW()
                WHERE public.payments.trip_id = EXCLUDED.trip_id;`,
                [
                  payment.id,
                  tripId,
                  payment.from || payment.fromUserId || "",
                  payment.to || payment.toUserId || "",
                  payment.fromUserId || payment.from || "",
                  payment.toUserId || payment.to || "",
                  Number(payment.amount) || 0,
                  payment.status || "confirmed",
                  payment.method || "Cash",
                  payment.note || "",
                  payment.originalAmount != null ? Number(payment.originalAmount) : null,
                  payment.currency || null,
                  payment.exchangeRate != null ? Number(payment.exchangeRate) : null,
                  JSON.stringify(Array.isArray(payment.auditLogs) ? payment.auditLogs : []),
                ]
              );
            }
            if (payment.activity && payment.activity.id) {
              const act = payment.activity;
              await pool.query(
                `INSERT INTO public.activities (
                  id, trip_id, ts, user_name, action, detail, actor_id, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (id) DO NOTHING;`,
                [
                  act.id,
                  tripId,
                  act.ts || "Just now",
                  act.user || act.user_name || "Traveler",
                  act.action || "recorded payment",
                  act.detail || "",
                  act.actorId || act.actor_id || userId,
                ]
              );
            }
          }
          break;
        }

        case "DELETE_PAYMENT": {
          const paymentId = payload?.paymentId || payload?.id;
          if (paymentId) {
            await pool.query("DELETE FROM public.payments WHERE id = $1 AND trip_id = $2;", [paymentId, tripId]);
          }
          break;
        }

        case "SAVE_EXPENSE": {
          const expense = payload;
          if (expense && expense.id) {
            const participantsList =
              Array.isArray(expense.participants) && expense.participants.length > 0
                ? expense.participants
                : [expense.paidBy || userId || "traveler"];

            await pool.query(
              `INSERT INTO public.expenses (
                id, trip_id, title, amount, category, date, paid_by, payers, created_by,
                method, split_type, participants, splits, split_percentages, split_shares,
                items, audit_logs, notes, receipt_url, original_amount, original_currency, exchange_rate,
                created_at, updated_at, deleted
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
                $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
                $16::jsonb, $17::jsonb, $18, $19, $20, $21, $22,
                NOW(), NOW(), $23
              )
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                amount = EXCLUDED.amount,
                category = EXCLUDED.category,
                date = EXCLUDED.date,
                paid_by = EXCLUDED.paid_by,
                payers = EXCLUDED.payers,
                method = EXCLUDED.method,
                split_type = EXCLUDED.split_type,
                participants = EXCLUDED.participants,
                splits = EXCLUDED.splits,
                split_percentages = EXCLUDED.split_percentages,
                split_shares = EXCLUDED.split_shares,
                items = EXCLUDED.items,
                audit_logs = EXCLUDED.audit_logs,
                notes = EXCLUDED.notes,
                receipt_url = EXCLUDED.receipt_url,
                original_amount = EXCLUDED.original_amount,
                original_currency = EXCLUDED.original_currency,
                exchange_rate = EXCLUDED.exchange_rate,
                deleted = EXCLUDED.deleted,
                updated_at = NOW()
              WHERE public.expenses.trip_id = EXCLUDED.trip_id;`,
              [
                expense.id,
                tripId,
                expense.title || "Expense",
                Number(expense.amount) || 0,
                expense.category || "General",
                expense.date || new Date().toISOString().split("T")[0],
                expense.paidBy || "",
                JSON.stringify(expense.payers || null),
                userId,
                expense.method || "equal",
                expense.splitType || expense.method || "equal",
                JSON.stringify(participantsList),
                JSON.stringify(expense.splits || {}),
                JSON.stringify(expense.splitPercentages || null),
                JSON.stringify(expense.splitShares || null),
                JSON.stringify(Array.isArray(expense.items) ? expense.items : null),
                JSON.stringify(Array.isArray(expense.auditLogs) ? expense.auditLogs : []),
                expense.notes || "",
                sanitizeReceiptUrl(expense.receiptUrl),
                expense.originalAmount != null ? Number(expense.originalAmount) : null,
                expense.currency || null,
                expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
                Boolean(expense.deleted),
              ]
            );
            if (expense.activity && expense.activity.id) {
              const act = expense.activity;
              await pool.query(
                `INSERT INTO public.activities (
                  id, trip_id, ts, user_name, action, detail, actor_id, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (id) DO NOTHING;`,
                [
                  act.id,
                  tripId,
                  act.ts || "Just now",
                  act.user || act.user_name || "Traveler",
                  act.action || "added expense",
                  act.detail || "",
                  act.actorId || act.actor_id || userId,
                ]
              );
            }
          }
          break;
        }

        case "DELETE_EXPENSE": {
          const expenseId = payload?.expenseId || payload?.id;
          if (expenseId) {
            await pool.query("UPDATE public.expenses SET deleted = true, deleted_at = NOW() WHERE id = $1 AND trip_id = $2;", [
              expenseId,
              tripId,
            ]);
          }
          break;
        }

        case "SAVE_MEMBER": {
          const member = payload;
          if (member) {
            const memId = member.id || member.userId || `m_${Date.now()}`;
            const safeRole = !isTripAdmin && (member.role === "admin" || member.role === "owner")
              ? "participant"
              : (member.role || "participant");
            await pool.query(
              `INSERT INTO public.trip_members (
                id, trip_id, user_id, name, role, avatar_color, phone, email, joined_at, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                role = CASE WHEN $10::boolean THEN EXCLUDED.role ELSE public.trip_members.role END,
                avatar_color = EXCLUDED.avatar_color,
                phone = EXCLUDED.phone,
                email = EXCLUDED.email,
                status = EXCLUDED.status
              WHERE public.trip_members.trip_id = EXCLUDED.trip_id;`,
              [
                memId,
                tripId,
                member.userId || memId,
                member.name || "Member",
                safeRole,
                member.avatarColor || "#0F6B65",
                member.phone || "",
                member.email || "",
                member.status || "active",
                isTripAdmin,
              ]
            );
          }
          break;
        }

        case "DELETE_MEMBER": {
          const memberId = payload?.memberId || payload?.id;
          if (memberId) {
            await pool.query("DELETE FROM public.trip_members WHERE id = $1 AND trip_id = $2;", [memberId, tripId]);
          }
          break;
        }

        case "SAVE_ACTIVITY": {
          const act = payload;
          if (act && act.id) {
            await pool.query(
              `INSERT INTO public.activities (
                id, trip_id, ts, user_name, action, detail, actor_id, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
              ON CONFLICT (id) DO UPDATE SET
                ts = EXCLUDED.ts,
                user_name = EXCLUDED.user_name,
                action = EXCLUDED.action,
                detail = EXCLUDED.detail,
                actor_id = EXCLUDED.actor_id
              WHERE public.activities.trip_id = EXCLUDED.trip_id;`,
              [
                act.id,
                tripId,
                act.ts || "Just now",
                act.user || act.user_name || "Traveler",
                act.action || "updated trip",
                act.detail || "",
                act.actorId || act.actor_id || userId || null,
              ]
            );
          }
          break;
        }

        case "SAVE_TRIP_SNAPSHOT": {
          const trip = payload;
          if (trip && (trip.id || tripId)) {
            const targetTripId = tripId;
            const effectiveOwnerId = !tripExists ? userId : (trip.ownerId || userId);
            const memberUserIds = Array.from(
              new Set([
                effectiveOwnerId,
                userId,
                ...(trip.memberUserIds || []),
                ...(trip.members || []).map((m: any) => m.userId || m.id),
              ].filter(Boolean))
            );
            await pool.query(
              `INSERT INTO public.trips (
                id, title, location, destination, start_date, end_date, currency, status,
                owner_id, owner_name, member_user_ids, invite_code, invite_expires_at, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, NOW(), NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                location = EXCLUDED.location,
                destination = EXCLUDED.destination,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                currency = EXCLUDED.currency,
                status = EXCLUDED.status,
                member_user_ids = EXCLUDED.member_user_ids,
                invite_expires_at = COALESCE(public.trips.invite_expires_at, EXCLUDED.invite_expires_at),
                updated_at = NOW();`,
              [
                targetTripId,
                trip.title || trip.name || "Untitled Trip",
                trip.location || trip.destination || "Destination",
                trip.destination || trip.location || "Destination",
                trip.startDate || new Date().toISOString().split("T")[0],
                trip.endDate || new Date().toISOString().split("T")[0],
                trip.currency || "INR",
                trip.status || "ACTIVE",
                effectiveOwnerId,
                trip.ownerName || "Traveler",
                JSON.stringify(memberUserIds),
                trip.inviteCode || generateSecureInviteCode(),
                trip.inviteExpiresAt || getDefaultInviteExpiryIso(),
              ]
            );

            // Persist nested members
            if (Array.isArray(trip.members)) {
              for (const member of trip.members) {
                if (!member) continue;
                const memId = member.id || member.userId || `m_${Date.now()}`;
                await pool.query(
                  `INSERT INTO public.trip_members (
                    id, trip_id, user_id, name, role, avatar_color, phone, email, joined_at, status
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
                  ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    role = EXCLUDED.role,
                    avatar_color = EXCLUDED.avatar_color,
                    phone = EXCLUDED.phone,
                    email = EXCLUDED.email,
                    status = EXCLUDED.status
                  WHERE public.trip_members.trip_id = EXCLUDED.trip_id;`,
                  [
                    memId,
                    targetTripId,
                    member.userId || memId,
                    member.name || "Member",
                    member.role || "participant",
                    member.avatarColor || "#0F6B65",
                    member.phone || "",
                    member.email || "",
                    member.status || "active",
                  ]
                );
              }
            }

            // Persist nested expenses
            if (Array.isArray(trip.expenses)) {
              for (const expense of trip.expenses) {
                if (!expense || !expense.id) continue;
                const participantsList =
                  Array.isArray(expense.participants) && expense.participants.length > 0
                    ? expense.participants
                    : [expense.paidBy || userId || "traveler"];
                await pool.query(
                  `INSERT INTO public.expenses (
                    id, trip_id, title, amount, category, date, paid_by, payers, created_by,
                    method, split_type, participants, splits, split_percentages, split_shares,
                    items, audit_logs, notes, receipt_url, original_amount, original_currency, exchange_rate,
                    created_at, updated_at, deleted
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
                    $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
                    $16::jsonb, $17::jsonb, $18, $19, $20, $21, $22,
                    NOW(), NOW(), $23
                  )
                  ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    amount = EXCLUDED.amount,
                    category = EXCLUDED.category,
                    date = EXCLUDED.date,
                    paid_by = EXCLUDED.paid_by,
                    payers = EXCLUDED.payers,
                    method = EXCLUDED.method,
                    split_type = EXCLUDED.split_type,
                    participants = EXCLUDED.participants,
                    splits = EXCLUDED.splits,
                    split_percentages = EXCLUDED.split_percentages,
                    split_shares = EXCLUDED.split_shares,
                    items = EXCLUDED.items,
                    audit_logs = EXCLUDED.audit_logs,
                    notes = EXCLUDED.notes,
                    receipt_url = EXCLUDED.receipt_url,
                    original_amount = EXCLUDED.original_amount,
                    original_currency = EXCLUDED.original_currency,
                    exchange_rate = EXCLUDED.exchange_rate,
                    deleted = EXCLUDED.deleted,
                    updated_at = NOW()
                  WHERE public.expenses.trip_id = EXCLUDED.trip_id;`,
                  [
                    expense.id,
                    targetTripId,
                    expense.title || "Expense",
                    Number(expense.amount) || 0,
                    expense.category || "General",
                    expense.date || new Date().toISOString().split("T")[0],
                    expense.paidBy || "",
                    JSON.stringify(expense.payers || null),
                    userId,
                    expense.method || "equal",
                    expense.splitType || expense.method || "equal",
                    JSON.stringify(participantsList),
                    JSON.stringify(expense.splits || {}),
                    JSON.stringify(expense.splitPercentages || null),
                    JSON.stringify(expense.splitShares || null),
                    JSON.stringify(Array.isArray(expense.items) ? expense.items : null),
                    JSON.stringify(Array.isArray(expense.auditLogs) ? expense.auditLogs : []),
                    expense.notes || "",
                    sanitizeReceiptUrl(expense.receiptUrl),
                    expense.originalAmount != null ? Number(expense.originalAmount) : null,
                    expense.currency || null,
                    expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
                    Boolean(expense.deleted),
                  ]
                );
              }
            }

            // Persist nested payments
            if (Array.isArray(trip.payments)) {
              for (const payment of trip.payments) {
                if (!payment || !payment.id) continue;
                await pool.query(
                  `INSERT INTO public.payments (
                    id, trip_id, from_member_id, to_member_id, from_user_id, to_user_id,
                    amount, status, method, note, original_amount, original_currency, exchange_rate,
                    audit_logs, created_at, updated_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), NOW())
                  ON CONFLICT (id) DO UPDATE SET
                    from_member_id = EXCLUDED.from_member_id,
                    to_member_id = EXCLUDED.to_member_id,
                    amount = EXCLUDED.amount,
                    status = EXCLUDED.status,
                    method = EXCLUDED.method,
                    note = EXCLUDED.note,
                    audit_logs = EXCLUDED.audit_logs,
                    updated_at = NOW()
                  WHERE public.payments.trip_id = EXCLUDED.trip_id;`,
                  [
                    payment.id,
                    targetTripId,
                    payment.from || payment.fromUserId || "",
                    payment.to || payment.toUserId || "",
                    payment.fromUserId || payment.from || "",
                    payment.toUserId || payment.to || "",
                    Number(payment.amount) || 0,
                    payment.status || "confirmed",
                    payment.method || "Cash",
                    payment.note || "",
                    payment.originalAmount != null ? Number(payment.originalAmount) : null,
                    payment.currency || null,
                    payment.exchangeRate != null ? Number(payment.exchangeRate) : null,
                    JSON.stringify(Array.isArray(payment.auditLogs) ? payment.auditLogs : []),
                  ]
                );
              }
            }

            // Persist nested activities
            if (Array.isArray(trip.activities)) {
              for (const act of trip.activities) {
                if (!act || !act.id) continue;
                await pool.query(
                  `INSERT INTO public.activities (
                    id, trip_id, ts, user_name, action, detail, actor_id, created_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                  ON CONFLICT (id) DO NOTHING;`,
                  [
                    act.id,
                    targetTripId,
                    act.ts || "Just now",
                    act.user || act.user_name || "Traveler",
                    act.action || "updated trip",
                    act.detail || "",
                    act.actorId || act.actor_id || userId || null,
                  ]
                );
              }
            }
          }
          break;
        }

        case "DELETE_TRIP": {
          await pool.query("DELETE FROM public.activities WHERE trip_id = $1;", [tripId]);
          await pool.query("DELETE FROM public.expenses WHERE trip_id = $1;", [tripId]);
          await pool.query("DELETE FROM public.payments WHERE trip_id = $1;", [tripId]);
          await pool.query("DELETE FROM public.trip_members WHERE trip_id = $1;", [tripId]);
          await pool.query("DELETE FROM public.trips WHERE id = $1;", [tripId]);
          break;
        }
      }

      return sendJson(res, 200, { success: true, processedVia: "postgres" });
    } catch (err: any) {
      console.warn("Notice executing mutation in api/sync/mutation:", err?.message || err);
      if (process.env.NODE_ENV === "production") {
        return sendJson(res, 503, { success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return sendJson(res, 503, { success: false, error: "Database unavailable" });
  }

  // Local store fallback (strictly scoped by trip_id, non-production only)
  const store = getLocalStore();
  if (type === "RECORD_PAYMENT" && payload?.id) {
    const idx = store.payments.findIndex((p: any) => p.id === payload.id && p.trip_id === tripId);
    if (idx >= 0) store.payments[idx] = { ...store.payments[idx], ...payload, trip_id: tripId };
    else if (!store.payments.some((p: any) => p.id === payload.id)) {
      store.payments.push({ ...payload, trip_id: tripId });
    }
  } else if (type === "DELETE_PAYMENT") {
    const paymentId = payload?.paymentId || payload?.id;
    if (paymentId) {
      store.payments = store.payments.filter((p: any) => !(p.id === paymentId && p.trip_id === tripId));
    }
  } else if (type === "SAVE_EXPENSE" && payload?.id) {
    const safePayload = { ...payload, receiptUrl: sanitizeReceiptUrl(payload.receiptUrl) };
    const idx = store.expenses.findIndex((e: any) => e.id === safePayload.id && e.trip_id === tripId);
    if (idx >= 0) store.expenses[idx] = { ...store.expenses[idx], ...safePayload, trip_id: tripId };
    else if (!store.expenses.some((e: any) => e.id === safePayload.id)) {
      store.expenses.push({ ...safePayload, trip_id: tripId });
    }
  } else if (type === "DELETE_EXPENSE") {
    const expenseId = payload?.expenseId || payload?.id;
    if (expenseId) {
      store.expenses = store.expenses.map((e: any) =>
        e.id === expenseId && e.trip_id === tripId ? { ...e, deleted: true } : e
      );
    }
  } else if (type === "SAVE_MEMBER" && payload) {
    const memId = payload.id || payload.userId || `m_${Date.now()}`;
    const idx = store.trip_members.findIndex((m: any) => m.id === memId && m.trip_id === tripId);
    if (idx >= 0) store.trip_members[idx] = { ...store.trip_members[idx], ...payload, id: memId, trip_id: tripId };
    else store.trip_members.push({ ...payload, id: memId, trip_id: tripId });
  } else if (type === "DELETE_MEMBER") {
    const memberId = payload?.memberId || payload?.id;
    if (memberId) {
      store.trip_members = store.trip_members.filter((m: any) => !(m.id === memberId && m.trip_id === tripId));
    }
  } else if (type === "SAVE_ACTIVITY" && payload?.id) {
    store.activities.push({ ...payload, trip_id: tripId });
  } else if (type === "SAVE_TRIP_SNAPSHOT" && payload) {
    const idx = store.trips.findIndex((t: any) => t.id === tripId);
    if (idx >= 0) store.trips[idx] = { ...store.trips[idx], ...payload, id: tripId };
    else store.trips.push({ ...payload, id: tripId });
  } else if (type === "DELETE_TRIP") {
    store.trips = store.trips.filter((t: any) => t.id !== tripId);
    store.trip_members = store.trip_members.filter((m: any) => m.trip_id !== tripId);
    store.expenses = store.expenses.filter((e: any) => e.trip_id !== tripId);
    store.payments = store.payments.filter((p: any) => p.trip_id !== tripId);
    store.activities = store.activities.filter((a: any) => a.trip_id !== tripId);
  }
  saveLocalStore(store);

  return sendJson(res, 200, { success: true, processedVia: "local_store" });
}
