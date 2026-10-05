import { pool, setCorsHeaders, sendJson } from "../_shared.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (!pool) {
    return sendJson(res, 503, { connected: false, error: "Database pool not initialized" });
  }

  const start = Date.now();
  try {
    const verRes = await pool.query("SELECT version();");
    const latencyMs = Date.now() - start;

    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tableCounts: Record<string, number> = {};
    for (const row of tablesRes.rows) {
      try {
        const countRes = await pool.query(`SELECT COUNT(*) FROM "${row.table_name}";`);
        tableCounts[row.table_name] = parseInt(countRes.rows[0].count, 10);
      } catch {
        tableCounts[row.table_name] = -1;
      }
    }

    return sendJson(res, 200, {
      connected: true,
      latencyMs,
      version: verRes.rows[0]?.version,
      tables: tableCounts,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return sendJson(res, 500, {
      connected: false,
      error: err?.message || "Unknown database error",
    });
  }
}
