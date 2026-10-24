import { pool, verifySessionToken, setCorsHeaders, sendJson } from "./_shared.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const session = verifySessionToken(token);

  if (!session || !session.userId) {
    return sendJson(res, 401, { success: false, error: "Authentication required" });
  }

  const userId = session.userId;

  if (!pool) {
    return sendJson(res, 503, { success: false, error: "Database offline" });
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
    const trips = tripsRes.rows;

    const fullTrips = [];
    for (const trip of trips) {
      const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
        pool.query("SELECT * FROM public.trip_members WHERE trip_id = $1 ORDER BY joined_at ASC;", [trip.id]),
        pool.query(
          "SELECT * FROM public.expenses WHERE trip_id = $1 AND COALESCE(deleted, false) = false ORDER BY created_at DESC;",
          [trip.id]
        ),
        pool.query("SELECT * FROM public.payments WHERE trip_id = $1 ORDER BY created_at DESC;", [trip.id]),
        pool.query("SELECT * FROM public.activities WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 50;", [trip.id]),
      ]);

      fullTrips.push({
        ...trip,
        members: membersRes.rows,
        expenses: expensesRes.rows,
        payments: paymentsRes.rows,
        activities: activitiesRes.rows,
      });
    }

    return sendJson(res, 200, { success: true, trips: fullTrips });
  } catch (err: any) {
    console.error("Error in /api/user-trips:", err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
}
