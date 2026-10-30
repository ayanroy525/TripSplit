import { pool, setCorsHeaders, sendJson } from "../_shared.ts";
import fs from "fs";
import path from "path";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
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

  // Local JSON fallback
  try {
    const filePath = path.resolve(process.cwd(), "data", "health_checks.json");
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return sendJson(res, 200, {
        success: true,
        source: "local_store",
        history: Array.isArray(data) ? data.slice(-30).reverse() : [],
      });
    }
  } catch {}

  return sendJson(res, 200, {
    success: true,
    source: "empty",
    history: [],
  });
}
