import { pool, verifySessionToken, setCorsHeaders, sendJson } from "../_shared.ts";

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
  const tripId = (req.query?.tripId || "").toString().trim();

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
        `SELECT role FROM public.trip_members
         WHERE trip_id = $1 AND (user_id = $2 OR id = $2)
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
