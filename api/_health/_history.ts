import { pool, setCorsHeaders, sendJson, verifyAdminRequest, withSentry } from "../_shared.js";
import { inMemoryHealthChecks, ensureDaily2AMCheckRan } from "./_runner.js";

async function handler(req: any, res: any) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const adminAuth = await verifyAdminRequest(req);
  if (!adminAuth.authorized) {
    return sendJson(res, adminAuth.statusCode || 403, {
      success: false,
      error: adminAuth.error || "Access Denied: Restricted to application administrator.",
    });
  }

  try {
    await ensureDaily2AMCheckRan();
  } catch (catchupErr: any) {
    console.warn("Notice during 2 AM catchup check in history:", catchupErr?.message || catchupErr);
  }

  if (pool) {
    try {
      const result = await pool.query(`
        SELECT id, status, latency_ms, table_counts, auth_ok, rpc_ok, check_type, error_details, executed_at
        FROM public.health_checks
        ORDER BY executed_at DESC
        LIMIT 30;
      `);
      return sendJson(res, 200, {
        success: true,
        source: "postgres",
        history: result.rows,
      });
    } catch (err: any) {
      console.warn("Notice querying health_checks in PostgreSQL:", err?.message || err);
    }
  }

  if (inMemoryHealthChecks.length > 0) {
    return sendJson(res, 200, {
      success: true,
      source: "in_memory",
      history: inMemoryHealthChecks.slice(-30).reverse(),
    });
  }

  return sendJson(res, 200, {
    success: true,
    source: "empty",
    history: [],
  });
}

export default withSentry(handler);
