import { pool, verifyAuthRequest, setCorsHeaders, sendJson, getFullTripsForUser } from "./_shared.js";
import type { ApiRequest, ApiResponse, DbRecord, DbTripChildRow } from "./_types.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const authResult = await verifyAuthRequest(req);
  if (!authResult.authorized || !authResult.userId) {
    return sendJson(res, authResult.statusCode || 401, {
      success: false,
      error: authResult.error || "Authentication required",
    });
  }

  const userId = authResult.userId;

  if (!pool) {
    return sendJson(res, 200, { success: true, trips: getFullTripsForUser(userId) });
  }

  try {
    const tripsQuery = `
      SELECT DISTINCT t.*
      FROM public.trips t
      LEFT JOIN public.trip_members tm ON tm.trip_id = t.id
      LEFT JOIN public.users u ON u.id = $1
      WHERE t.owner_id = $1
         OR t.member_user_ids @> to_jsonb($1::text)
         OR tm.user_id = $1
         OR tm.id = $1
         OR (u.email IS NOT NULL AND u.email <> '' AND LOWER(TRIM(tm.email)) = LOWER(TRIM(u.email)))
         OR (u.phone IS NOT NULL AND LENGTH(regexp_replace(u.phone, '\\D', '', 'g')) >= 7
             AND regexp_replace(COALESCE(tm.phone, ''), '\\D', '', 'g') LIKE '%' || regexp_replace(u.phone, '\\D', '', 'g') || '%')
      ORDER BY t.created_at DESC;
    `;
    const tripsRes = await pool.query(tripsQuery, [userId]);
    const trips = tripsRes.rows as DbRecord[];

    if (trips.length === 0) {
      return sendJson(res, 200, { success: true, trips: [] });
    }

    // Batch-fetch all relational rows in 4 parallel queries instead of 4 * N queries
    const tripIds = trips.map((t) => t.id);
    const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
      pool.query<DbTripChildRow>(
        "SELECT * FROM public.trip_members WHERE trip_id = ANY($1::text[]) ORDER BY joined_at ASC;",
        [tripIds]
      ),
      pool.query<DbTripChildRow>(
        "SELECT * FROM public.expenses WHERE trip_id = ANY($1::text[]) AND COALESCE(deleted, false) = false ORDER BY created_at DESC;",
        [tripIds]
      ),
      pool.query<DbTripChildRow>(
        "SELECT * FROM public.payments WHERE trip_id = ANY($1::text[]) ORDER BY created_at DESC;",
        [tripIds]
      ),
      pool.query<DbTripChildRow>(
        "SELECT * FROM public.activities WHERE trip_id = ANY($1::text[]) ORDER BY created_at DESC;",
        [tripIds]
      ),
    ]);

    const membersByTrip = new Map<string, DbTripChildRow[]>();
    const expensesByTrip = new Map<string, DbTripChildRow[]>();
    const paymentsByTrip = new Map<string, DbTripChildRow[]>();
    const activitiesByTrip = new Map<string, DbTripChildRow[]>();

    for (const m of membersRes.rows) {
      const list = membersByTrip.get(m.trip_id) || [];
      list.push(m);
      membersByTrip.set(m.trip_id, list);
    }
    for (const e of expensesRes.rows) {
      const list = expensesByTrip.get(e.trip_id) || [];
      list.push(e);
      expensesByTrip.set(e.trip_id, list);
    }
    for (const p of paymentsRes.rows) {
      const list = paymentsByTrip.get(p.trip_id) || [];
      list.push(p);
      paymentsByTrip.set(p.trip_id, list);
    }
    for (const a of activitiesRes.rows) {
      const list = activitiesByTrip.get(a.trip_id) || [];
      if (list.length < 50) {
        list.push(a);
        activitiesByTrip.set(a.trip_id, list);
      }
    }

    const fullTrips = trips.map((trip) => ({
      ...trip,
      members: membersByTrip.get(trip.id) || [],
      expenses: expensesByTrip.get(trip.id) || [],
      payments: paymentsByTrip.get(trip.id) || [],
      activities: activitiesByTrip.get(trip.id) || [],
    }));

    return sendJson(res, 200, { success: true, trips: fullTrips });
  } catch {
    console.error("Error in /api/user-trips");
    return sendJson(res, 500, { success: false, error: "Failed to load trips." });
  }
}
