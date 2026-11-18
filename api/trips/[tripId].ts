import {
  pool,
  verifyAuthRequest,
  checkTripAuthorization,
  sanitizeReceiptUrl,
  setCorsHeaders,
  parseBody,
  sendJson,
  getLocalStore,
  saveLocalStore,
  generateSecureInviteCode,
  getDefaultInviteExpiryIso,
  linkUserToTripMembersInDb,
} from "../_shared.js";

function normalizeInviteCodeInput(rawInput: any): string {
  let raw = String(rawInput || "").trim();
  if (raw.includes("code=")) {
    const match = raw.match(/code=([^&?#]+)/);
    if (match && match[1]) raw = decodeURIComponent(match[1]);
  } else if (raw.startsWith("#join?")) {
    raw = raw.replace("#join?", "");
  }
  return raw.trim().toUpperCase();
}

function normalizePhoneDigits(phone?: string | null): string {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function phonesMatch(a?: string | null, b?: string | null): boolean {
  const cleanA = normalizePhoneDigits(a);
  const cleanB = normalizePhoneDigits(b);
  if (cleanA.length < 7 || cleanB.length < 7) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.length >= 10 && cleanB.length >= 10) {
    return cleanA.slice(-10) === cleanB.slice(-10);
  }
  return false;
}

function emailsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const cleanA = String(a).trim().toLowerCase();
  const cleanB = String(b).trim().toLowerCase();
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB;
}

async function insertActivityInDb(tripId: string, act: any, fallbackUserId: string) {
  if (!pool || !act || !act.id) return;
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
      act.actorId || act.actor_id || fallbackUserId || null,
    ]
  );
}

async function upsertExpenseInDb(tripId: string, expense: any, userId: string) {
  if (!pool || !expense || !expense.id) return;
  const participantsList =
    Array.isArray(expense.participants) && expense.participants.length > 0
      ? expense.participants
      : [expense.paidBy || expense.paid_by || userId || "traveler"];

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
      expense.paidBy || expense.paid_by || "",
      JSON.stringify(expense.payers || null),
      userId,
      expense.method || "equal",
      expense.splitType || expense.split_type || expense.method || "equal",
      JSON.stringify(participantsList),
      JSON.stringify(expense.splits || {}),
      JSON.stringify(expense.splitPercentages || expense.split_percentages || null),
      JSON.stringify(expense.splitShares || expense.split_shares || null),
      JSON.stringify(Array.isArray(expense.items) ? expense.items : null),
      JSON.stringify(Array.isArray(expense.auditLogs || expense.audit_logs) ? (expense.auditLogs || expense.audit_logs) : []),
      expense.notes || "",
      sanitizeReceiptUrl(expense.receiptUrl || expense.receipt_url),
      (expense.originalAmount ?? expense.original_amount) != null
        ? Number(expense.originalAmount ?? expense.original_amount)
        : null,
      expense.currency || expense.original_currency || null,
      (expense.exchangeRate ?? expense.exchange_rate) != null
        ? Number(expense.exchangeRate ?? expense.exchange_rate)
        : null,
      Boolean(expense.deleted),
    ]
  );
}

async function upsertPaymentInDb(tripId: string, payment: any) {
  if (!pool || !payment || !payment.id) return;
  if (payment.status && (payment.amount == null || (!payment.from && !payment.from_member_id && !payment.fromUserId))) {
    await pool.query(
      `UPDATE public.payments
       SET status = $1,
           confirmed_by = COALESCE($2, confirmed_by),
           confirmed_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE confirmed_at END,
           cancelled_by = COALESCE($3, cancelled_by),
           cancelled_at = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE cancelled_at END,
           updated_at = NOW()
       WHERE id = $4 AND trip_id = $5;`,
      [payment.status, payment.confirmedBy || payment.confirmed_by || null, payment.cancelledBy || payment.cancelled_by || null, payment.id, tripId]
    );
  } else {
    await pool.query(
      `INSERT INTO public.payments (
        id, trip_id, from_member_id, to_member_id, from_user_id, to_user_id,
        amount, status, method, note, original_amount, original_currency, exchange_rate,
        confirmed_by, confirmed_at, cancelled_by, cancelled_at,
        audit_logs, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        from_member_id = EXCLUDED.from_member_id,
        to_member_id = EXCLUDED.to_member_id,
        amount = EXCLUDED.amount,
        status = EXCLUDED.status,
        method = EXCLUDED.method,
        note = EXCLUDED.note,
        confirmed_by = COALESCE(EXCLUDED.confirmed_by, public.payments.confirmed_by),
        confirmed_at = COALESCE(EXCLUDED.confirmed_at, public.payments.confirmed_at),
        cancelled_by = COALESCE(EXCLUDED.cancelled_by, public.payments.cancelled_by),
        cancelled_at = COALESCE(EXCLUDED.cancelled_at, public.payments.cancelled_at),
        audit_logs = EXCLUDED.audit_logs,
        updated_at = NOW()
      WHERE public.payments.trip_id = EXCLUDED.trip_id;`,
      [
        payment.id,
        tripId,
        payment.from || payment.from_member_id || payment.fromUserId || "",
        payment.to || payment.to_member_id || payment.toUserId || "",
        payment.fromUserId || payment.from_user_id || payment.from || "",
        payment.toUserId || payment.to_user_id || payment.to || "",
        Number(payment.amount) || 0,
        payment.status || "confirmed",
        payment.method || "Cash",
        payment.note || "",
        (payment.originalAmount ?? payment.original_amount) != null
          ? Number(payment.originalAmount ?? payment.original_amount)
          : null,
        payment.currency || payment.original_currency || null,
        (payment.exchangeRate ?? payment.exchange_rate) != null
          ? Number(payment.exchangeRate ?? payment.exchange_rate)
          : null,
        payment.confirmedBy || payment.confirmed_by || null,
        payment.confirmedAt || payment.confirmed_at || (payment.confirmedBy ? new Date().toISOString() : null),
        payment.cancelledBy || payment.cancelled_by || null,
        payment.cancelledAt || payment.cancelled_at || (payment.cancelledBy ? new Date().toISOString() : null),
        JSON.stringify(Array.isArray(payment.auditLogs || payment.audit_logs) ? (payment.auditLogs || payment.audit_logs) : []),
      ]
    );
  }
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const url = String(req.url || "");
  const pathname = url.split("?")[0];
  const body = parseBody(req);
  const queryAction = String(req.query?.action || body?.action || "").trim();

  // Extract tripId, resource, and itemId from either query params or REST path /api/trips/:tripId/:resource/:itemId
  let tripIdParam = String(req.query?.tripId || req.params?.tripId || "").trim();
  let resourceParam = String(req.query?.resource || req.params?.resource || "").trim().toLowerCase();
  let itemIdParam = String(req.query?.itemId || req.params?.itemId || "").trim();

  const subResourceMatch = pathname.match(
    /^\/api\/trips\/([^/?#]+)\/(expenses|payments|trip_members|members|activities)(?:\/([^/?#]+))?\/?$/i
  );
  if (subResourceMatch) {
    tripIdParam = decodeURIComponent(subResourceMatch[1]);
    resourceParam = subResourceMatch[2].toLowerCase();
    if (subResourceMatch[3]) {
      itemIdParam = decodeURIComponent(subResourceMatch[3]);
    }
  } else if (!tripIdParam) {
    const tripMatch = pathname.match(/^\/api\/trips\/([^/?#]+)\/?$/i);
    if (tripMatch && tripMatch[1] !== "[tripId]") {
      tripIdParam = decodeURIComponent(tripMatch[1]);
    }
  }

  // 1. Handle Invite Lookup (/api/trips/invite/lookup or /api/trips/invite/:code) - Unauthenticated
  if (
    queryAction === "invite-lookup" ||
    tripIdParam === "invite-lookup" ||
    pathname.includes("/api/trips/invite/lookup") ||
    (req.method === "GET" && pathname.includes("/api/trips/invite/"))
  ) {
    const rawCode = body?.inviteCode || req.query?.code || (tripIdParam !== "invite-lookup" ? tripIdParam : "");
    const clean = normalizeInviteCodeInput(rawCode);
    if (!clean) {
      return sendJson(res, 400, { success: false, error: "Please enter an invite code." });
    }

    if (pool) {
      try {
        const tripRes = await pool.query(
          `SELECT id, title, invite_expires_at,
                  (SELECT COUNT(*)::int FROM public.trip_members tm WHERE tm.trip_id = public.trips.id) AS member_count
           FROM public.trips
           WHERE invite_code IS NOT NULL AND TRIM(invite_code) <> '' AND (
             UPPER(TRIM(invite_code)) = $1
             OR UPPER(TRIM(invite_code)) = 'TRIP-' || $1
             OR UPPER(TRIM(REPLACE(invite_code, 'TRIP-', ''))) = $1
           )
           LIMIT 1;`,
          [clean]
        );
        const trip = tripRes.rows[0];
        if (trip) {
          if (trip.invite_expires_at && new Date(trip.invite_expires_at) < new Date()) {
            return sendJson(res, 410, {
              success: false,
              error: "This invite code has expired. Please ask the trip organizer for a new one.",
            });
          }

          return sendJson(res, 200, {
            success: true,
            trip: {
              title: trip.title || "Untitled Trip",
              name: trip.title || "Untitled Trip",
              memberCount: Number(trip.member_count || 0),
            },
          });
        }
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 404, {
            success: false,
            error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
          });
        }
      } catch (err: any) {
        console.warn("PostgreSQL invite lookup notice:", err?.message || err);
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 503, { success: false, error: "Database unavailable" });
        }
      }
    } else if (process.env.NODE_ENV === "production") {
      return sendJson(res, 503, { success: false, error: "Database unavailable" });
    }

    const store = getLocalStore();
    const trip = store.trips.find((t: any) => {
      const codeVal = (t.inviteCode || t.invite_code || "").trim().toUpperCase();
      if (!codeVal) return false;
      return (
        codeVal === clean ||
        codeVal === `TRIP-${clean}` ||
        codeVal.replace("TRIP-", "").trim() === clean
      );
    });

    if (trip) {
      const expAt = trip.inviteExpiresAt || trip.invite_expires_at;
      if (expAt && new Date(expAt) < new Date()) {
        return sendJson(res, 410, {
          success: false,
          error: "This invite code has expired. Please ask the trip organizer for a new one.",
        });
      }
      const memberCount = store.trip_members.filter((m: any) => m.trip_id === trip.id).length;
      return sendJson(res, 200, {
        success: true,
        trip: {
          title: trip.title || trip.name || "Untitled Trip",
          name: trip.title || trip.name || "Untitled Trip",
          memberCount,
        },
      });
    }

    return sendJson(res, 404, {
      success: false,
      error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
    });
  }

  // 2. Handle Invite Join (/api/trips/invite/join or /api/trips/join)
  if (
    queryAction === "invite-join" ||
    tripIdParam === "invite-join" ||
    pathname.includes("/api/trips/invite/join") ||
    pathname.includes("/api/trips/join")
  ) {
    const { inviteCode, user } = body || {};
    const clean = normalizeInviteCodeInput(inviteCode);

    const authHeader = String(req.headers?.authorization || req.headers?.Authorization || "");
    let userId = "";
    if (authHeader.startsWith("Bearer ")) {
      const authResult = await verifyAuthRequest(req);
      if (!authResult.authorized || !authResult.userId) {
        return sendJson(res, 401, { success: false, error: authResult.error || "Invalid or expired token" });
      }
      if (user?.id && authResult.userId !== user.id) {
        return sendJson(res, 403, { success: false, error: "Cannot join trip as another user" });
      }
      userId = authResult.userId;
    } else if (process.env.NODE_ENV === "production") {
      return sendJson(res, 401, { success: false, error: "Authentication token required to join a trip." });
    } else {
      userId = user?.id || user?.userId || "";
    }

    const userName = (user?.name || "Traveler").trim();
    const userEmail = (user?.email || "").trim().toLowerCase();
    const userPhone = (user?.phone || "").trim();
    const userAvatar = user?.avatarColor || "#0F6B65";

    if (!clean) {
      return sendJson(res, 400, { success: false, error: "Invite code is required." });
    }
    if (!userId) {
      return sendJson(res, 400, { success: false, error: "Please log in before joining a trip." });
    }

    if (pool) {
      try {
        const tripRes = await pool.query(
          `SELECT * FROM public.trips
           WHERE invite_code IS NOT NULL AND TRIM(invite_code) <> '' AND (
             UPPER(TRIM(invite_code)) = $1
             OR UPPER(TRIM(invite_code)) = 'TRIP-' || $1
             OR UPPER(TRIM(REPLACE(invite_code, 'TRIP-', ''))) = $1
           )
           LIMIT 1;`,
          [clean]
        );
        const trip = tripRes.rows[0];
        if (!trip) {
          return sendJson(res, 404, {
            success: false,
            error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
          });
        }
        if (trip.invite_expires_at && new Date(trip.invite_expires_at) < new Date()) {
          return sendJson(res, 410, {
            success: false,
            error: "This invite code has expired. Please ask the trip organizer for a new one.",
          });
        }

        const existingMemberRes = await pool.query(
          "SELECT * FROM public.trip_members WHERE trip_id = $1 AND (user_id = $2 OR id = $2) LIMIT 1;",
          [trip.id, userId]
        );

        let memberId = userId;
        let alreadyMember = false;

        if (existingMemberRes.rows.length > 0) {
          alreadyMember = true;
          memberId = existingMemberRes.rows[0].id;
        } else {
          let placeholderRes: any = { rows: [] };
          if (userEmail || userPhone) {
            placeholderRes = await pool.query(
              `SELECT * FROM public.trip_members
               WHERE trip_id = $1 AND (
                 ($2 <> '' AND LOWER(email) = $2)
                 OR ($3 <> '' AND phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($3, '\\D', '', 'g'), 10))
               ) LIMIT 1;`,
              [trip.id, userEmail, userPhone]
            );
          }

          if (placeholderRes.rows.length > 0) {
            const ph = placeholderRes.rows[0];
            memberId = ph.id;
            await pool.query(
              `UPDATE public.trip_members
               SET user_id = $1,
                   name = COALESCE(NULLIF(name, 'Traveler'), $2),
                   avatar_color = COALESCE(avatar_color, $3),
                   phone = COALESCE(phone, $4),
                   email = COALESCE(email, $5),
                   status = 'active'
               WHERE id = $6 AND trip_id = $7;`,
              [userId, userName, userAvatar, userPhone || null, userEmail || null, ph.id, trip.id]
            );
          } else {
            await pool.query(
              `INSERT INTO public.trip_members (
                id, trip_id, user_id, name, role, avatar_color, phone, email, joined_at, status
              ) VALUES ($1, $2, $3, $4, 'participant', $5, $6, $7, NOW(), 'active')
              ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                name = EXCLUDED.name,
                avatar_color = EXCLUDED.avatar_color,
                phone = COALESCE(EXCLUDED.phone, trip_members.phone),
                email = COALESCE(EXCLUDED.email, trip_members.email)
              WHERE public.trip_members.trip_id = EXCLUDED.trip_id;`,
              [memberId, trip.id, userId, userName, userAvatar, userPhone || null, userEmail || null]
            );
          }

          const currentIds: string[] = Array.isArray(trip.member_user_ids) ? trip.member_user_ids : [];
          const updatedIds = Array.from(new Set([...currentIds, userId, trip.owner_id].filter(Boolean)));
          await pool.query("UPDATE public.trips SET member_user_ids = $1, updated_at = NOW() WHERE id = $2;", [
            JSON.stringify(updatedIds),
            trip.id,
          ]);

          await pool.query(
            `INSERT INTO public.activities (id, trip_id, ts, user_name, action, detail, actor_id, created_at)
             VALUES ($1, $2, 'Just now', $3, 'joined', $4, $5, NOW());`,
            [`act_${Date.now()}`, trip.id, userName, `${userName} joined the trip via invite code`, userId]
          );
        }

        const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
          pool.query("SELECT * FROM public.trip_members WHERE trip_id = $1 ORDER BY joined_at ASC;", [trip.id]),
          pool.query(
            "SELECT * FROM public.expenses WHERE trip_id = $1 AND COALESCE(deleted, false) = false ORDER BY created_at DESC;",
            [trip.id]
          ),
          pool.query("SELECT * FROM public.payments WHERE trip_id = $1 ORDER BY created_at DESC;", [trip.id]),
          pool.query("SELECT * FROM public.activities WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 50;", [trip.id]),
        ]);

        return sendJson(res, 200, {
          success: true,
          alreadyMember,
          tripId: trip.id,
          trip: {
            id: trip.id,
            title: trip.title,
            location: trip.location || trip.destination || "",
            destination: trip.destination || trip.location || "",
            startDate: trip.start_date,
            endDate: trip.end_date,
            currency: trip.currency || "INR",
            status: trip.status || "ACTIVE",
            ownerId: trip.owner_id,
            ownerName: trip.owner_name,
            inviteCode: trip.invite_code,
            inviteExpiresAt: trip.invite_expires_at,
            memberUserIds: Array.isArray(trip.member_user_ids) ? trip.member_user_ids : [],
            createdAt: trip.created_at,
            members: membersRes.rows,
            expenses: expensesRes.rows,
            payments: paymentsRes.rows,
            activities: activitiesRes.rows,
          },
        });
      } catch (err: any) {
        console.warn("PostgreSQL join error in serverless handler:", err?.message || err);
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 503, { success: false, error: "Database unavailable" });
        }
      }
    } else if (process.env.NODE_ENV === "production") {
      return sendJson(res, 503, { success: false, error: "Database unavailable" });
    }

    const store = getLocalStore();
    const trip = store.trips.find((t: any) => {
      const codeVal = (t.inviteCode || t.invite_code || "").trim().toUpperCase();
      if (!codeVal) return false;
      return (
        codeVal === clean ||
        codeVal === `TRIP-${clean}` ||
        codeVal.replace("TRIP-", "").trim() === clean
      );
    });
    if (!trip) {
      return sendJson(res, 404, {
        success: false,
        error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
      });
    }
    const isAlready = store.trip_members.some(
      (m: any) => m.trip_id === trip.id && (m.user_id === userId || m.id === userId)
    );
    if (!isAlready) {
      store.trip_members.push({
        id: userId,
        trip_id: trip.id,
        user_id: userId,
        name: userName,
        role: "participant",
        avatar_color: userAvatar,
        phone: userPhone,
        email: userEmail,
        joined_at: new Date().toISOString(),
      });
      if (!trip.memberUserIds) trip.memberUserIds = [];
      if (!trip.memberUserIds.includes(userId)) trip.memberUserIds.push(userId);
      saveLocalStore(store);
    }

    return sendJson(res, 200, {
      success: true,
      alreadyMember: isAlready,
      tripId: trip.id,
      trip: {
        ...trip,
        members: store.trip_members.filter((m: any) => m.trip_id === trip.id),
        expenses: store.expenses.filter((e: any) => e.trip_id === trip.id),
        payments: store.payments.filter((p: any) => p.trip_id === trip.id),
        activities: store.activities.filter((a: any) => a.trip_id === trip.id),
      },
    });
  }

  // All remaining routes require authentication; derive userId exclusively from the verified token
  const authResult = await verifyAuthRequest(req);
  if (!authResult.authorized || !authResult.userId) {
    return sendJson(res, authResult.statusCode || 401, {
      success: false,
      error: authResult.error || "Authentication required",
    });
  }

  const userId = authResult.userId;

  if (process.env.NODE_ENV === "production" && !pool) {
    return sendJson(res, 503, { success: false, error: "Database unavailable" });
  }

  // 3. Handle Smart User-Member Linking: POST /api/trips/link-members
  if (
    queryAction === "link-members" ||
    tripIdParam === "link-members" ||
    pathname.includes("/api/trips/link-members")
  ) {
    let email = String(body?.email || authResult.email || "").trim().toLowerCase();
    let phone = String(body?.phone || "").trim();
    let name = String(body?.name || "Traveler").trim();

    if (pool) {
      try {
        const userRes = await pool.query(
          "SELECT name, email, phone FROM public.users WHERE id = $1 LIMIT 1;",
          [userId]
        );
        if (userRes.rows[0]) {
          email = userRes.rows[0].email || email;
          phone = userRes.rows[0].phone || phone;
          name = userRes.rows[0].name || name;
        }

        const allMembersRes = await pool.query("SELECT * FROM public.trip_members;");
        const matchedTripIds = new Set<string>();
        let linkedMembersCount = 0;

        for (const row of allMembersRes.rows) {
          if (row.user_id === userId) continue;
          const phoneMatches = phone && row.phone && phonesMatch(phone, row.phone);
          const emailMatches = email && row.email && emailsMatch(email, row.email);
          if (phoneMatches || emailMatches) {
            const currentName = (row.name || "").trim();
            const isPlaceholderName =
              !currentName ||
              currentName.toLowerCase() === "member" ||
              currentName.toLowerCase() === "traveler" ||
              currentName.toLowerCase() === "guest";
            const newName = isPlaceholderName && name ? name : row.name;

            await pool.query(
              `UPDATE public.trip_members
               SET user_id = $1,
                   name = $2,
                   phone = COALESCE(NULLIF(phone, ''), $3),
                   email = COALESCE(NULLIF(email, ''), $4)
               WHERE id = $5 AND trip_id = $6;`,
              [userId, newName, phone || row.phone || "", email || row.email || "", row.id, row.trip_id]
            );
            linkedMembersCount++;
            if (row.trip_id) matchedTripIds.add(row.trip_id);
          }
        }

        for (const tId of matchedTripIds) {
          const tripRes = await pool.query("SELECT member_user_ids FROM public.trips WHERE id = $1 LIMIT 1;", [tId]);
          if (tripRes.rows[0]) {
            const currentIds: string[] = Array.isArray(tripRes.rows[0].member_user_ids)
              ? tripRes.rows[0].member_user_ids
              : [];
            if (!currentIds.includes(userId)) {
              const updatedIds = [...currentIds, userId];
              await pool.query(
                "UPDATE public.trips SET member_user_ids = $1::jsonb, updated_at = NOW() WHERE id = $2;",
                [JSON.stringify(updatedIds), tId]
              );
            }
          }
        }

        await linkUserToTripMembersInDb(userId, email, phone, name);

        return sendJson(res, 200, {
          success: true,
          linkedTripsCount: matchedTripIds.size,
          linkedMembersCount,
        });
      } catch (err: any) {
        console.warn("Error in /api/trips/link-members:", err?.message || err);
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 503, { success: false, error: "Database unavailable" });
        }
      }
    }

    return sendJson(res, 200, {
      success: true,
      linkedTripsCount: 0,
      linkedMembersCount: 0,
    });
  }

  // 4. Create or Upsert Trip: POST /api/trips (or POST/PUT /api/trips/:tripId without sub-resource)
  if (
    !resourceParam &&
    (queryAction === "trips-root" ||
      tripIdParam === "trips-root" ||
      pathname === "/api/trips" ||
      pathname === "/api/trips/" ||
      req.method === "POST" ||
      req.method === "PUT")
  ) {
    const trip = body?.trip || body || {};
    const targetTripId = String(
      (tripIdParam && tripIdParam !== "trips-root" ? tripIdParam : "") || trip.id || body?.tripId || ""
    ).trim();

    if (!targetTripId) {
      return sendJson(res, 400, { success: false, error: "Trip id is required" });
    }
    if (trip.id && trip.id !== targetTripId) {
      return sendJson(res, 400, { success: false, error: "Trip ID mismatch in payload" });
    }

    let tripExists = false;
    if (pool) {
      try {
        const existsRes = await pool.query("SELECT id, owner_id FROM public.trips WHERE id = $1 LIMIT 1;", [
          targetTripId,
        ]);
        tripExists = existsRes.rows.length > 0;
      } catch (err: any) {
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 503, { success: false, error: "Database unavailable" });
        }
      }
    } else {
      const store = getLocalStore();
      tripExists = store.trips.some((t: any) => t.id === targetTripId);
    }

    if (!tripExists) {
      if (trip.ownerId && trip.ownerId !== userId) {
        return sendJson(res, 403, {
          success: false,
          error: "Access denied: Cannot create a trip owned by another user.",
        });
      }
    } else {
      const authCheck = await checkTripAuthorization(targetTripId, userId, pool);
      if (!authCheck.canAccess) {
        return sendJson(res, 403, {
          success: false,
          error: "Access denied: You are not a member of this trip.",
        });
      }
      if (authCheck.role === "viewer") {
        return sendJson(res, 403, {
          success: false,
          error: "Access denied: Viewers have read-only access to this trip.",
        });
      }
    }

    const effectiveOwnerId = !tripExists ? userId : trip.ownerId || trip.owner_id || userId;
    const memberUserIds = Array.from(
      new Set(
        [
          effectiveOwnerId,
          userId,
          ...(trip.memberUserIds || trip.member_user_ids || []),
          ...(trip.members || []).map((m: any) => m.userId || m.user_id || m.id),
        ].filter(Boolean)
      )
    );

    if (pool) {
      try {
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
            trip.startDate || trip.start_date || new Date().toISOString().split("T")[0],
            trip.endDate || trip.end_date || new Date().toISOString().split("T")[0],
            trip.currency || "INR",
            trip.status || "ACTIVE",
            effectiveOwnerId,
            trip.ownerName || trip.owner_name || "Traveler",
            JSON.stringify(memberUserIds),
            trip.inviteCode || trip.invite_code || generateSecureInviteCode(),
            trip.inviteExpiresAt || trip.invite_expires_at || getDefaultInviteExpiryIso(),
          ]
        );

        if (Array.isArray(trip.members)) {
          for (const member of trip.members) {
            if (!member) continue;
            const memId = member.id || member.userId || member.user_id || `m_${Date.now()}`;
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
                member.userId || member.user_id || memId,
                member.name || "Member",
                member.role || "participant",
                member.avatarColor || member.avatar_color || "#0F6B65",
                member.phone || "",
                member.email || "",
                member.status || "active",
              ]
            );
          }
        }

        if (Array.isArray(trip.expenses)) {
          for (const exp of trip.expenses) {
            if (!exp || !exp.id) continue;
            await upsertExpenseInDb(targetTripId, exp, exp.createdBy || exp.created_by || userId);
          }
        }

        if (Array.isArray(trip.payments)) {
          for (const pay of trip.payments) {
            if (!pay || !pay.id) continue;
            await upsertPaymentInDb(targetTripId, pay);
          }
        }

        if (Array.isArray(trip.activities)) {
          for (const act of trip.activities) {
            if (!act || !act.id) continue;
            await insertActivityInDb(targetTripId, act, userId);
          }
        }

        return sendJson(res, 200, { success: true, tripId: targetTripId });
      } catch (err: any) {
        console.error("Error in POST /api/trips:", err?.message || err);
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 503, { success: false, error: "Database unavailable" });
        }
      }
    }

    const store = getLocalStore();
    const idx = store.trips.findIndex((t: any) => t.id === targetTripId);
    const localTripRecord = {
      ...trip,
      id: targetTripId,
      owner_id: effectiveOwnerId,
      ownerId: effectiveOwnerId,
      memberUserIds,
    };
    if (idx >= 0) store.trips[idx] = { ...store.trips[idx], ...localTripRecord };
    else store.trips.push(localTripRecord);
    saveLocalStore(store);

    return sendJson(res, 200, { success: true, tripId: targetTripId });
  }

  const tripId = tripIdParam;
  if (!tripId) {
    return sendJson(res, 400, { success: false, error: "tripId is required" });
  }

  // Verify the caller is a member of the trip before any read or write
  const authCheck = await checkTripAuthorization(tripId, userId, pool);
  if (!authCheck.canAccess) {
    return sendJson(res, 403, {
      success: false,
      error: "Access denied. You are not a member of this trip.",
    });
  }

  const isTripAdmin = Boolean(authCheck.isOwner || authCheck.role === "admin" || authCheck.role === "owner");

  // 5. Handle Sub-resource Endpoints: /api/trips/:tripId/(expenses|payments|trip_members|members|activities)
  if (resourceParam) {
    if (authCheck.role === "viewer" && req.method !== "GET") {
      return sendJson(res, 403, {
        success: false,
        error: "Access denied: Viewers have read-only access to this trip.",
      });
    }

    // 5A. EXPENSES
    if (resourceParam === "expenses") {
      if (req.method === "POST" || req.method === "PUT") {
        const expense = body?.expense || body || {};
        const expenseId = String(itemIdParam || expense.id || "").trim();
        if (!expenseId) {
          return sendJson(res, 400, { success: false, error: "Expense id is required" });
        }
        expense.id = expenseId;

        if (!isTripAdmin && pool) {
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
            [expenseId, userId, tripId]
          );
          if (existingExpRes.rows.length > 0) {
            const row = existingExpRes.rows[0];
            const isExpenseOwner =
              row.created_by === userId || row.paid_by === userId || Boolean(row.is_member_owner);
            if (!isExpenseOwner) {
              return sendJson(res, 403, {
                success: false,
                error: "Access denied: Participants can only edit their own expenses.",
              });
            }
          }
        }

        if (pool) {
          try {
            await upsertExpenseInDb(tripId, expense, userId);
            if (body?.activity) {
              await insertActivityInDb(tripId, body.activity, userId);
            }
            return sendJson(res, 200, { success: true, expenseId });
          } catch (err: any) {
            console.error("Error saving expense:", err?.message || err);
            if (process.env.NODE_ENV === "production") {
              return sendJson(res, 503, { success: false, error: "Database unavailable" });
            }
          }
        }

        const store = getLocalStore();
        const safePayload = { ...expense, trip_id: tripId, receiptUrl: sanitizeReceiptUrl(expense.receiptUrl) };
        const idx = store.expenses.findIndex((e: any) => e.id === expenseId && e.trip_id === tripId);
        if (idx >= 0) store.expenses[idx] = { ...store.expenses[idx], ...safePayload };
        else store.expenses.push(safePayload);
        saveLocalStore(store);
        return sendJson(res, 200, { success: true, expenseId });
      }

      if (req.method === "DELETE") {
        const expenseId = String(itemIdParam || req.query?.expenseId || body?.expenseId || body?.id || "").trim();
        if (!expenseId) {
          return sendJson(res, 400, { success: false, error: "expenseId is required" });
        }

        if (!isTripAdmin && pool) {
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
            [expenseId, userId, tripId]
          );
          if (existingExpRes.rows.length > 0) {
            const row = existingExpRes.rows[0];
            const isExpenseOwner =
              row.created_by === userId || row.paid_by === userId || Boolean(row.is_member_owner);
            if (!isExpenseOwner) {
              return sendJson(res, 403, {
                success: false,
                error: "Access denied: Participants can only delete their own expenses.",
              });
            }
          }
        }

        if (pool) {
          try {
            await pool.query(
              "UPDATE public.expenses SET deleted = true, deleted_at = NOW() WHERE id = $1 AND trip_id = $2;",
              [expenseId, tripId]
            );
            if (body?.activity) {
              await insertActivityInDb(tripId, body.activity, userId);
            }
            return sendJson(res, 200, { success: true, expenseId });
          } catch (err: any) {
            console.error("Error deleting expense:", err?.message || err);
            if (process.env.NODE_ENV === "production") {
              return sendJson(res, 503, { success: false, error: "Database unavailable" });
            }
          }
        }

        const store = getLocalStore();
        store.expenses = store.expenses.map((e: any) =>
          e.id === expenseId && e.trip_id === tripId ? { ...e, deleted: true } : e
        );
        saveLocalStore(store);
        return sendJson(res, 200, { success: true, expenseId });
      }
    }

    // 5B. PAYMENTS
    if (resourceParam === "payments") {
      if (req.method === "POST" || req.method === "PUT") {
        const payment = body?.payment || body || {};
        const paymentId = String(itemIdParam || payment.id || "").trim();
        if (!paymentId) {
          return sendJson(res, 400, { success: false, error: "Payment id is required" });
        }
        payment.id = paymentId;

        if (pool) {
          try {
            await upsertPaymentInDb(tripId, payment);
            if (body?.activity) {
              await insertActivityInDb(tripId, body.activity, userId);
            }
            return sendJson(res, 200, { success: true, paymentId });
          } catch (err: any) {
            console.error("Error saving payment:", err?.message || err);
            if (process.env.NODE_ENV === "production") {
              return sendJson(res, 503, { success: false, error: "Database unavailable" });
            }
          }
        }

        const store = getLocalStore();
        const idx = store.payments.findIndex((p: any) => p.id === paymentId && p.trip_id === tripId);
        if (idx >= 0) store.payments[idx] = { ...store.payments[idx], ...payment, trip_id: tripId };
        else store.payments.push({ ...payment, trip_id: tripId });
        saveLocalStore(store);
        return sendJson(res, 200, { success: true, paymentId });
      }

      if (req.method === "DELETE") {
        const paymentId = String(itemIdParam || req.query?.paymentId || body?.paymentId || body?.id || "").trim();
        if (!paymentId) {
          return sendJson(res, 400, { success: false, error: "paymentId is required" });
        }

        if (pool) {
          try {
            await pool.query("DELETE FROM public.payments WHERE id = $1 AND trip_id = $2;", [paymentId, tripId]);
            return sendJson(res, 200, { success: true, paymentId });
          } catch (err: any) {
            console.error("Error deleting payment:", err?.message || err);
            if (process.env.NODE_ENV === "production") {
              return sendJson(res, 503, { success: false, error: "Database unavailable" });
            }
          }
        }

        const store = getLocalStore();
        store.payments = store.payments.filter((p: any) => !(p.id === paymentId && p.trip_id === tripId));
        saveLocalStore(store);
        return sendJson(res, 200, { success: true, paymentId });
      }
    }

    // 5C. TRIP_MEMBERS / MEMBERS
    if (resourceParam === "trip_members" || resourceParam === "members") {
      if (req.method === "POST" || req.method === "PUT") {
        const member = body?.member || body || {};
        const memId = String(itemIdParam || member.id || member.userId || `m_${Date.now()}`).trim();
        const requestedRole = String(member.role || "participant").toLowerCase();

        if (!isTripAdmin && (requestedRole === "admin" || requestedRole === "owner")) {
          return sendJson(res, 403, {
            success: false,
            error: "Access denied: Participants cannot promote members to admin.",
          });
        }

        let resolvedUserId = member.userId || member.user_id || memId;
        let resolvedName = member.name || "Member";
        const memberPhone = String(member.phone || "").trim();
        const memberEmail = String(member.email || "").trim();

        if (pool) {
          try {
            // Smart User-Member Linking: check if phone or email matches an existing registered user
            if ((memberPhone || memberEmail) && (!member.userId || member.userId === member.id)) {
              const usersRes = await pool.query("SELECT id, name, email, phone FROM public.users;");
              const matchedUser = usersRes.rows.find(
                (u: any) =>
                  (memberEmail && u.email && emailsMatch(memberEmail, u.email)) ||
                  (memberPhone && u.phone && phonesMatch(memberPhone, u.phone))
              );
              if (matchedUser) {
                resolvedUserId = matchedUser.id;
                const currentName = resolvedName.trim();
                if (
                  !currentName ||
                  currentName.toLowerCase() === "member" ||
                  currentName.toLowerCase() === "traveler" ||
                  currentName.toLowerCase() === "guest"
                ) {
                  resolvedName = matchedUser.name || resolvedName;
                }
              }
            }

            const safeRole =
              !isTripAdmin && (requestedRole === "admin" || requestedRole === "owner")
                ? "participant"
                : member.role || "participant";

            await pool.query(
              `INSERT INTO public.trip_members (
                id, trip_id, user_id, name, role, avatar_color, phone, email, joined_at, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
              ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
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
                resolvedUserId,
                resolvedName,
                safeRole,
                member.avatarColor || member.avatar_color || "#0F6B65",
                memberPhone,
                memberEmail,
                member.status || "active",
                isTripAdmin,
              ]
            );

            if (resolvedUserId && resolvedUserId !== memId) {
              const tripRes = await pool.query(
                "SELECT member_user_ids FROM public.trips WHERE id = $1 LIMIT 1;",
                [tripId]
              );
              if (tripRes.rows[0]) {
                const currentIds: string[] = Array.isArray(tripRes.rows[0].member_user_ids)
                  ? tripRes.rows[0].member_user_ids
                  : [];
                if (!currentIds.includes(resolvedUserId)) {
                  await pool.query(
                    "UPDATE public.trips SET member_user_ids = $1::jsonb, updated_at = NOW() WHERE id = $2;",
                    [JSON.stringify([...currentIds, resolvedUserId]), tripId]
                  );
                }
              }
            }

            return sendJson(res, 200, {
              success: true,
              member: {
                ...member,
                id: memId,
                tripId,
                userId: resolvedUserId,
                name: resolvedName,
              },
            });
          } catch (err: any) {
            console.error("Error saving member:", err?.message || err);
            if (process.env.NODE_ENV === "production") {
              return sendJson(res, 503, { success: false, error: "Database unavailable" });
            }
          }
        }

        const store = getLocalStore();
        const idx = store.trip_members.findIndex((m: any) => m.id === memId && m.trip_id === tripId);
        const savedRecord = {
          ...member,
          id: memId,
          trip_id: tripId,
          user_id: resolvedUserId,
          userId: resolvedUserId,
          name: resolvedName,
        };
        if (idx >= 0) store.trip_members[idx] = { ...store.trip_members[idx], ...savedRecord };
        else store.trip_members.push(savedRecord);
        saveLocalStore(store);

        return sendJson(res, 200, {
          success: true,
          member: {
            ...member,
            id: memId,
            tripId,
            userId: resolvedUserId,
            name: resolvedName,
          },
        });
      }

      if (req.method === "DELETE") {
        if (!isTripAdmin) {
          return sendJson(res, 403, {
            success: false,
            error: "Access denied: Only trip admins can remove members.",
          });
        }
        const memberId = String(itemIdParam || req.query?.memberId || body?.memberId || body?.id || "").trim();
        if (!memberId) {
          return sendJson(res, 400, { success: false, error: "memberId is required" });
        }

        if (pool) {
          try {
            await pool.query(
              "DELETE FROM public.trip_members WHERE (id = $1 OR user_id = $1) AND trip_id = $2;",
              [memberId, tripId]
            );
            return sendJson(res, 200, { success: true, memberId });
          } catch (err: any) {
            console.error("Error deleting member:", err?.message || err);
            if (process.env.NODE_ENV === "production") {
              return sendJson(res, 503, { success: false, error: "Database unavailable" });
            }
          }
        }

        const store = getLocalStore();
        store.trip_members = store.trip_members.filter(
          (m: any) => !((m.id === memberId || m.user_id === memberId) && m.trip_id === tripId)
        );
        saveLocalStore(store);
        return sendJson(res, 200, { success: true, memberId });
      }
    }

    // 5D. ACTIVITIES
    if (resourceParam === "activities") {
      if (req.method === "POST" || req.method === "PUT") {
        const activity = body?.activity || body || {};
        const actId = String(itemIdParam || activity.id || `act_${Date.now()}`).trim();
        activity.id = actId;

        if (pool) {
          try {
            await insertActivityInDb(tripId, activity, userId);
            return sendJson(res, 200, { success: true, activityId: actId });
          } catch (err: any) {
            console.error("Error saving activity:", err?.message || err);
            if (process.env.NODE_ENV === "production") {
              return sendJson(res, 503, { success: false, error: "Database unavailable" });
            }
          }
        }

        const store = getLocalStore();
        store.activities.push({ ...activity, id: actId, trip_id: tripId });
        saveLocalStore(store);
        return sendJson(res, 200, { success: true, activityId: actId });
      }

      if (req.method === "DELETE") {
        const actId = String(itemIdParam || req.query?.activityId || body?.activityId || body?.id || "").trim();
        if (!actId) {
          return sendJson(res, 400, { success: false, error: "activityId is required" });
        }

        if (pool) {
          try {
            await pool.query("DELETE FROM public.activities WHERE id = $1 AND trip_id = $2;", [actId, tripId]);
            return sendJson(res, 200, { success: true, activityId: actId });
          } catch (err: any) {
            console.error("Error deleting activity:", err?.message || err);
            if (process.env.NODE_ENV === "production") {
              return sendJson(res, 503, { success: false, error: "Database unavailable" });
            }
          }
        }

        const store = getLocalStore();
        store.activities = store.activities.filter((a: any) => !(a.id === actId && a.trip_id === tripId));
        saveLocalStore(store);
        return sendJson(res, 200, { success: true, activityId: actId });
      }
    }

    return sendJson(res, 405, { success: false, error: "Method Not Allowed for resource" });
  }

  // 6. Delete Trip: DELETE /api/trips/:tripId
  if (req.method === "DELETE") {
    if (!authCheck.isOwner) {
      return sendJson(res, 403, {
        success: false,
        error: "Access denied: Only the trip owner can delete this trip.",
      });
    }

    if (pool) {
      try {
        await pool.query("DELETE FROM public.activities WHERE trip_id = $1;", [tripId]);
        await pool.query("DELETE FROM public.expenses WHERE trip_id = $1;", [tripId]);
        await pool.query("DELETE FROM public.payments WHERE trip_id = $1;", [tripId]);
        await pool.query("DELETE FROM public.trip_members WHERE trip_id = $1;", [tripId]);
        await pool.query("DELETE FROM public.trips WHERE id = $1;", [tripId]);
        return sendJson(res, 200, { success: true, tripId });
      } catch (err: any) {
        console.error("Error in DELETE /api/trips/[tripId]:", err?.message || err);
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 503, { success: false, error: "Database unavailable" });
        }
      }
    }

    const store = getLocalStore();
    store.trips = store.trips.filter((t: any) => t.id !== tripId);
    store.trip_members = store.trip_members.filter((m: any) => m.trip_id !== tripId);
    store.expenses = store.expenses.filter((e: any) => e.trip_id !== tripId);
    store.payments = store.payments.filter((p: any) => p.trip_id !== tripId);
    store.activities = store.activities.filter((a: any) => a.trip_id !== tripId);
    saveLocalStore(store);
    return sendJson(res, 200, { success: true, tripId });
  }

  // 7. Standard Trip Detail Fetch: GET /api/trips/:tripId
  if (pool) {
    try {
      const tripRes = await pool.query("SELECT * FROM public.trips WHERE id = $1 LIMIT 1;", [tripId]);
      const trip = tripRes.rows[0];
      if (!trip) {
        return sendJson(res, 404, { success: false, error: "Trip not found" });
      }

      const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
        pool.query("SELECT * FROM public.trip_members WHERE trip_id = $1 ORDER BY joined_at ASC;", [trip.id]),
        pool.query(
          "SELECT * FROM public.expenses WHERE trip_id = $1 AND COALESCE(deleted, false) = false ORDER BY created_at DESC;",
          [trip.id]
        ),
        pool.query("SELECT * FROM public.payments WHERE trip_id = $1 ORDER BY created_at DESC;", [trip.id]),
        pool.query("SELECT * FROM public.activities WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 50;", [trip.id]),
      ]);

      return sendJson(res, 200, {
        success: true,
        trip: {
          ...trip,
          members: membersRes.rows,
          expenses: expensesRes.rows,
          payments: paymentsRes.rows,
          activities: activitiesRes.rows,
        },
      });
    } catch (err: any) {
      console.error("Error in GET /api/trips/[tripId]:", err);
      if (process.env.NODE_ENV === "production") {
        return sendJson(res, 503, { success: false, error: "Database unavailable" });
      }
    }
  }

  const store = getLocalStore();
  const trip = store.trips.find((t: any) => t.id === tripId);
  if (!trip) {
    return sendJson(res, 404, { success: false, error: "Trip not found" });
  }

  return sendJson(res, 200, {
    success: true,
    trip: {
      ...trip,
      members: store.trip_members.filter((m: any) => m.trip_id === trip.id),
      expenses: store.expenses.filter((e: any) => e.trip_id === trip.id && !e.deleted),
      payments: store.payments.filter((p: any) => p.trip_id === trip.id),
      activities: store.activities.filter((a: any) => a.trip_id === trip.id),
    },
  });
}
