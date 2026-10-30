import { pool } from "../_shared.ts";
import fs from "fs";
import path from "path";
import { getTelegramConfig, sendTelegramMessage } from "../telegram/_client.ts";
import { formatDiagnosticTelegramReport } from "../telegram/_formatter.ts";

export interface DiagnosticResult {
  id: string;
  status: "nominal" | "degraded" | "offline";
  latency_ms: number;
  table_counts: {
    users: number;
    trips: number;
    trip_members: number;
    expenses: number;
    payments: number;
    activities: number;
  };
  auth_ok: boolean;
  rpc_ok: boolean;
  check_type: string;
  error_details: string | null;
  executed_at: string;
}

export async function runDiagnosticSweep(checkType = "scheduled_2am"): Promise<DiagnosticResult> {
  const checkId = "chk_" + Date.now();
  const executedAt = new Date().toISOString();

  let latency = 0;
  let status: "nominal" | "degraded" | "offline" = "nominal";
  let errorDetails: string | null = null;
  const tableCounts = {
    users: 0,
    trips: 0,
    trip_members: 0,
    expenses: 0,
    payments: 0,
    activities: 0,
  };
  let authOk = false;
  let rpcOk = false;

  if (pool) {
    try {
      const pingStart = Date.now();
      await pool.query("SELECT 1;");
      latency = Date.now() - pingStart;

      // Run unified count query and RPC validations in parallel over pooled connections
      const [countsRes, authRes, rpcRes] = await Promise.all([
        pool
          .query(`
            SELECT
              (SELECT count(*) FROM public.users) as users,
              (SELECT count(*) FROM public.trips) as trips,
              (SELECT count(*) FROM public.trip_members) as trip_members,
              (SELECT count(*) FROM public.expenses) as expenses,
              (SELECT count(*) FROM public.payments) as payments,
              (SELECT count(*) FROM public.activities) as activities;
          `)
          .catch((tableErr: any) => {
            console.warn("Unified count query notice:", tableErr?.message);
            return { rows: [] };
          }),
        pool
          .query("SELECT * FROM public.lookup_user_for_auth($1);", ["test@gmail.com"])
          .then((res) => ({ ok: true, rows: res.rows, error: "" }))
          .catch((authErr: any) => ({ ok: false, rows: [] as any[], error: String(authErr?.message || authErr) })),
        pool
          .query("SELECT public.get_user_trips_data($1) as trips;", ["0afe2cf3-ea87-46ae-9993-8d8d4c37ba31"])
          .then((res) => ({ ok: true, rows: res.rows, error: "" }))
          .catch((rpcErr: any) => ({ ok: false, rows: [] as any[], error: String(rpcErr?.message || rpcErr) })),
      ]);

      if (countsRes.rows && countsRes.rows[0]) {
        const row = countsRes.rows[0];
        tableCounts.users = parseInt(row.users || "0", 10);
        tableCounts.trips = parseInt(row.trips || "0", 10);
        tableCounts.trip_members = parseInt(row.trip_members || "0", 10);
        tableCounts.expenses = parseInt(row.expenses || "0", 10);
        tableCounts.payments = parseInt(row.payments || "0", 10);
        tableCounts.activities = parseInt(row.activities || "0", 10);
      }

      authOk = authRes.ok;
      if (!authRes.ok) {
        errorDetails = `Auth RPC error: ${authRes.error}`;
      }

      rpcOk = rpcRes.ok && Array.isArray((rpcRes.rows as any)?.[0]?.trips);
      if (!rpcOk) {
        const rpcMsg = `RPC error: ${rpcRes.error || "Invalid response format"}`;
        errorDetails = errorDetails ? `${errorDetails}; ${rpcMsg}` : rpcMsg;
      }

      if (!authOk || !rpcOk) {
        status = "degraded";
      } else {
        status = "nominal";
      }

      // Persist to PostgreSQL public.health_checks
      try {
        await pool.query(
          `INSERT INTO public.health_checks (
            id, status, latency_ms, table_counts, auth_ok, rpc_ok, check_type, error_details, executed_at
          ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9);`,
          [
            checkId,
            status,
            latency,
            JSON.stringify(tableCounts),
            authOk,
            rpcOk,
            checkType,
            errorDetails,
            executedAt,
          ]
        );
      } catch (dbLogErr: any) {
        console.warn("Could not insert log into public.health_checks:", dbLogErr?.message);
      }
    } catch (dbErr: any) {
      status = "offline";
      errorDetails = `Database connection error: ${dbErr?.message || dbErr}`;
    }
  } else {
    status = "degraded";
    errorDetails = "Database pool offline; using local state";
  }

  const result: DiagnosticResult = {
    id: checkId,
    status,
    latency_ms: latency,
    table_counts: tableCounts,
    auth_ok: authOk,
    rpc_ok: rpcOk,
    check_type: checkType,
    error_details: errorDetails,
    executed_at: executedAt,
  };

  // Local file backup
  try {
    const dir = path.resolve(process.cwd(), "data");
    const filePath = path.resolve(dir, "health_checks.json");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let existing: DiagnosticResult[] = [];
    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {}
    }
    existing.push(result);
    if (existing.length > 100) existing = existing.slice(-100);
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8");
  } catch {}

  // Telegram Alert Dispatch
  try {
    const tgConfig = await getTelegramConfig();
    if (tgConfig.botToken && tgConfig.chatId) {
      const isManual = checkType === "manual_trigger" || checkType === "manual_test";
      // Send if daily check and dailyEnabled, or if degraded/offline (always alert on failure)
      if ((tgConfig.dailyEnabled && !isManual) || result.status !== "nominal") {
        const report = formatDiagnosticTelegramReport(result, tgConfig.webhookUrl);
        await sendTelegramMessage(report.text, {
          inlineKeyboard: report.inlineKeyboard,
        });
      }
    }
  } catch (tgErr: any) {
    console.warn("Could not dispatch Telegram health alert:", tgErr?.message || tgErr);
  }

  return result;
}
