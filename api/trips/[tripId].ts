import {
  pool,
  verifyAuthRequest,
  setCorsHeaders,
  parseBody,
  sendJson,
  getLocalStore,
  saveLocalStore,
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

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const url = String(req.url || "");
  const body = parseBody(req);
  const queryAction = String(req.query?.action || body?.action || "").trim();
  const tripIdParam = (req.query?.tripId || "").toString().trim();

  // 1. Handle Invite Lookup (/api/trips/invite/lookup or /api/trips/invite/:code)
  if (
    queryAction === "invite-lookup" ||
    tripIdParam === "invite-lookup" ||
    url.includes("/api/trips/invite/lookup") ||
    (req.method === "GET" && url.includes("/api/trips/invite/"))
  ) {
    const rawCode = body?.inviteCode || req.query?.code || (tripIdParam !== "invite-lookup" ? tripIdParam : "");
    const clean = normalizeInviteCodeInput(rawCode);
    if (!clean) {
      return sendJson(res, 400, { success: false, error: "Please enter an invite code." });
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
        if (trip) {
          if (trip.invite_expires_at && new Date(trip.invite_expires_at) < new Date()) {
            return sendJson(res, 410, {
              success: false,
              error: "This invite code has expired. Please ask the trip organizer for a new one.",
            });
          }

          const membersRes = await pool.query(
            "SELECT id, user_id, name, role, avatar_color, joined_at FROM public.trip_members WHERE trip_id = $1;",
            [trip.id]
          );

          return sendJson(res, 200, {
            success: true,
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
              members: membersRes.rows.map((m: any) => ({
                id: m.id,
                userId: m.user_id || m.id,
                name: m.name || "Traveler",
                role: m.role || "participant",
                avatarColor: m.avatar_color || "#0F6B65",
                joinedAt: m.joined_at,
              })),
              expenses: [],
              payments: [],
              activities: [],
            },
          });
        }
      } catch (err: any) {
        console.warn("PostgreSQL invite lookup notice:", err?.message || err);
      }
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
      const members = store.trip_members
        .filter((m: any) => m.trip_id === trip.id)
        .map((m: any) => ({
          id: m.id,
          userId: m.user_id || m.userId || m.id,
          name: m.name || "Traveler",
          role: m.role || "participant",
          avatarColor: m.avatar_color || m.avatarColor || "#0F6B65",
          joinedAt: m.joined_at || m.joinedAt,
        }));
      return sendJson(res, 200, {
        success: true,
        trip: {
          ...trip,
          members,
          expenses: [],
          payments: [],
          activities: [],
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
    url.includes("/api/trips/invite/join") ||
    url.includes("/api/trips/join")
  ) {
    const { inviteCode, user } = body || {};
    const clean = normalizeInviteCodeInput(inviteCode);
    const userId = user?.id || user?.userId;
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

    const authHeader = String(req.headers?.authorization || req.headers?.Authorization || "");
    if (authHeader.startsWith("Bearer ")) {
      const authResult = await verifyAuthRequest(req);
      if (!authResult.authorized || !authResult.userId) {
        return sendJson(res, 401, { success: false, error: authResult.error || "Invalid or expired token" });
      }
      if (authResult.userId !== userId) {
        return sendJson(res, 403, { success: false, error: "Cannot join trip as another user" });
      }
    } else if (process.env.NODE_ENV === "production") {
      return sendJson(res, 401, { success: false, error: "Authentication token required to join a trip." });
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
      }
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

  // 3. Standard Trip Detail Fetch: GET /api/trips/[tripId]
  const authResult = await verifyAuthRequest(req);
  if (!authResult.authorized || !authResult.userId) {
    return sendJson(res, authResult.statusCode || 401, {
      success: false,
      error: authResult.error || "Authentication required",
    });
  }

  const userId = authResult.userId;
  const tripId = tripIdParam;

  if (!tripId) {
    return sendJson(res, 400, { success: false, error: "tripId is required" });
  }

  if (!pool) {
    return sendJson(res, 503, { success: false, error: "Database offline" });
  }

  try {
    const tripRes = await pool.query("SELECT * FROM public.trips WHERE id = $1 LIMIT 1;", [tripId]);
    const trip = tripRes.rows[0];
    if (!trip) {
      return sendJson(res, 404, { success: false, error: "Trip not found" });
    }

    const isOwner = trip.owner_id === userId;
    let isMember = isOwner;

    if (!isMember) {
      const memberRes = await pool.query(
        `SELECT tm.role FROM public.trip_members tm
         LEFT JOIN public.users u ON u.id = $2
         WHERE tm.trip_id = $1 AND (
           tm.user_id = $2
           OR tm.id = $2
           OR (u.email IS NOT NULL AND u.email <> '' AND LOWER(TRIM(tm.email)) = LOWER(TRIM(u.email)))
           OR (u.phone IS NOT NULL AND LENGTH(regexp_replace(u.phone, '\\D', '', 'g')) >= 7
               AND regexp_replace(COALESCE(tm.phone, ''), '\\D', '', 'g') LIKE '%' || regexp_replace(u.phone, '\\D', '', 'g') || '%')
         )
         LIMIT 1;`,
        [tripId, userId]
      );
      if (memberRes.rows.length > 0) {
        isMember = true;
      }
    }

    if (!isMember) {
      return sendJson(res, 403, {
        success: false,
        error: "Access denied. You are not a member of this trip.",
      });
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
    console.error("Error in /api/trips/[tripId]:", err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
}
