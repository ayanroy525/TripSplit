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
} from "../_shared";

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
  const body = parseBody(req);
  const { type, tripId, payload } = body || {};

  if (!type || !tripId) {
    return sendJson(res, 400, { success: false, error: "type and tripId are required" });
  }

  // Authorization check: Verify user is a member of this trip (or creating a genuinely new trip where they are owner)
  let tripExists = false;
  if (pool) {
    try {
      const existsRes = await pool.query("SELECT id FROM public.trips WHERE id = $1 LIMIT 1;", [tripId]);
      tripExists = existsRes.rows.length > 0;
    } catch {}
  } else {
    const store = getLocalStore();
    tripExists = store.trips.some((t: any) => t.id === tripId);
  }

  if (type === "SAVE_TRIP_SNAPSHOT" && !tripExists) {
    if (payload?.id && payload.id !== tripId) {
      return sendJson(res, 400, { success: false, error: "Trip ID mismatch in snapshot payload." });
    }
    if (payload?.ownerId && payload.ownerId !== userId) {
      return sendJson(res, 403, { success: false, error: "Access denied: Cannot create a trip owned by another user." });
    }
  } else {
    const authCheck = await checkTripAuthorization(tripId, userId, pool);
    if (!authCheck.canAccess) {
      return sendJson(res, 403, {
        success: false,
        error: "Access denied: You are not an authorized member of this trip.",
      });
    }
    if (type === "DELETE_TRIP" && !authCheck.isOwner) {
      return sendJson(res, 403, {
        success: false,
        error: "Access denied: Only the trip owner can delete this trip.",
      });
    }
    if (authCheck.role === "viewer") {
      return sendJson(res, 403, {
        success: false,
        error: "Access denied: Viewers have read-only access to this trip.",
      });
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
                  created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET
                  from_member_id = EXCLUDED.from_member_id,
                  to_member_id = EXCLUDED.to_member_id,
                  amount = EXCLUDED.amount,
                  status = EXCLUDED.status,
                  method = EXCLUDED.method,
                  note = EXCLUDED.note,
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
                notes, receipt_url, original_amount, original_currency, exchange_rate,
                created_at, updated_at, deleted
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
                $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
                $16, $17, $18, $19, $20,
                NOW(), NOW(), $21
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
                notes = EXCLUDED.notes,
                receipt_url = EXCLUDED.receipt_url,
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
                expense.createdBy || userId || "",
                expense.method || "equal",
                expense.splitType || expense.method || "equal",
                JSON.stringify(participantsList),
                JSON.stringify(expense.splits || {}),
                JSON.stringify(expense.splitPercentages || null),
                JSON.stringify(expense.splitShares || null),
                expense.notes || "",
                sanitizeReceiptUrl(expense.receiptUrl),
                expense.originalAmount != null ? Number(expense.originalAmount) : null,
                expense.currency || null,
                expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
                Boolean(expense.deleted),
              ]
            );
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
                tripId,
                member.userId || memId,
                member.name || "Member",
                member.role || "member",
                member.avatarColor || "#0F6B65",
                member.phone || "",
                member.email || "",
                member.status || "active",
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

        case "SAVE_TRIP_SNAPSHOT": {
          const trip = payload;
          if (trip && (trip.id || tripId)) {
            const targetTripId = tripId;
            const memberUserIds = Array.from(
              new Set([
                trip.ownerId || userId,
                ...(trip.memberUserIds || []),
                ...(trip.members || []).map((m: any) => m.userId || m.id),
              ].filter(Boolean))
            );
            await pool.query(
              `INSERT INTO public.trips (
                id, title, location, destination, start_date, end_date, currency, status,
                owner_id, owner_name, member_user_ids, invite_code, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, NOW(), NOW()
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
                trip.ownerId || userId || "",
                trip.ownerName || "Traveler",
                JSON.stringify(memberUserIds),
                trip.inviteCode || `TRIP-${targetTripId.slice(-6).toUpperCase()}`,
              ]
            );
          }
          break;
        }

        case "DELETE_TRIP": {
          await pool.query("DELETE FROM public.trips WHERE id = $1;", [tripId]);
          break;
        }
      }

      return sendJson(res, 200, { success: true, processedVia: "postgres" });
    } catch (err: any) {
      console.warn("Notice executing mutation in api/sync/mutation:", err?.message || err);
    }
  }

  // Local store fallback (strictly scoped by trip_id)
  const store = getLocalStore();
  if (type === "RECORD_PAYMENT" && payload?.id) {
    const idx = store.payments.findIndex((p: any) => p.id === payload.id && p.trip_id === tripId);
    if (idx >= 0) store.payments[idx] = { ...store.payments[idx], ...payload, trip_id: tripId };
    else if (!store.payments.some((p: any) => p.id === payload.id)) {
      store.payments.push({ ...payload, trip_id: tripId });
    }
  } else if (type === "SAVE_EXPENSE" && payload?.id) {
    const safePayload = { ...payload, receiptUrl: sanitizeReceiptUrl(payload.receiptUrl) };
    const idx = store.expenses.findIndex((e: any) => e.id === safePayload.id && e.trip_id === tripId);
    if (idx >= 0) store.expenses[idx] = { ...store.expenses[idx], ...safePayload, trip_id: tripId };
    else if (!store.expenses.some((e: any) => e.id === safePayload.id)) {
      store.expenses.push({ ...safePayload, trip_id: tripId });
    }
  }
  saveLocalStore(store);

  return sendJson(res, 200, { success: true, processedVia: "local_store" });
}
