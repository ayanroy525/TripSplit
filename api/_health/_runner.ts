import { pool } from "../_shared.js";
import { getErrorMessage } from "../_types.js";
import { getTelegramConfig, sendTelegramMessage } from "../telegram/_client.js";
import { formatDiagnosticTelegramReport } from "../telegram/_formatter.js";

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
  telegram_sent?: boolean;
  telegram_error?: string | null;
}

export const inMemoryHealthChecks: DiagnosticResult[] = [];

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
          .catch((tableErr: unknown) => {
            console.warn("Unified count query notice:", getErrorMessage(tableErr));
            return { rows: [] as Record<string, string | undefined>[] };
          }),
        pool
          .query("SELECT * FROM public.lookup_user_for_auth($1);", ["test@gmail.com"])
          .then((res) => ({ ok: true, rows: res.rows as Record<string, unknown>[], error: "" }))
          .catch((authErr: unknown) => ({
            ok: false,
            rows: [] as Record<string, unknown>[],
            error: getErrorMessage(authErr),
          })),
        pool
          .query("SELECT public.get_user_trips_data($1) as trips;", ["0afe2cf3-ea87-46ae-9993-8d8d4c37ba31"])
          .then((res) => ({ ok: true, rows: res.rows as Array<{ trips?: unknown }>, error: "" }))
          .catch((rpcErr: unknown) => ({
            ok: false,
            rows: [] as Array<{ trips?: unknown }>,
            error: getErrorMessage(rpcErr),
          })),
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

      rpcOk = rpcRes.ok && Array.isArray(rpcRes.rows[0]?.trips);
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
      } catch (dbLogErr: unknown) {
        console.warn("Could not insert log into public.health_checks:", getErrorMessage(dbLogErr));
      }
    } catch (dbErr: unknown) {
      status = "offline";
      errorDetails = `Database connection error: ${getErrorMessage(dbErr)}`;
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
    telegram_sent: false,
    telegram_error: null,
  };

  // Keep recent diagnostic checks in-memory when DB is unavailable (never write to data/health_checks.json)
  inMemoryHealthChecks.push(result);
  if (inMemoryHealthChecks.length > 100) {
    inMemoryHealthChecks.splice(0, inMemoryHealthChecks.length - 100);
  }

      // Telegram Alert Dispatch
  // Skip duplicate dispatch if invoked directly from Telegram processor (which sends/edits its own reply)
  const isTelegramInternal = checkType === "telegram_on_demand" || checkType === "telegram_post_heal";
  if (!isTelegramInternal) {
    try {
      const tgConfig = await getTelegramConfig();
      if (tgConfig.botToken && tgConfig.chatId) {
        const isManual = checkType === "manual_trigger" || checkType === "manual_test";
        // Always send for manual triggers, when dailyEnabled is true, or when degraded/offline
        if (isManual || tgConfig.dailyEnabled || result.status !== "nominal") {
          const report = formatDiagnosticTelegramReport(result, tgConfig.webhookUrl);
          const tgRes = await sendTelegramMessage(report.text, {
            inlineKeyboard: report.inlineKeyboard,
          });
          result.telegram_sent = tgRes.success;
          if (!tgRes.success) {
            result.telegram_error = tgRes.error || "Telegram dispatch failed";
          }
        }
      }
    } catch (tgErr: unknown) {
      const msg = getErrorMessage(tgErr);
      result.telegram_error = msg;
      console.warn("Could not dispatch Telegram health alert:", msg);
    }
  }

  return result;
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // UTC+5:30 (Asia/Kolkata)

/**
 * Returns the UTC timestamp (ms) of today's 2:00 AM IST window start (if currently >= 2:00 AM IST),
 * and the delay (ms) until the next upcoming 2:00 AM IST.
 */
export function get2AMISTScheduleInfo(nowMs = Date.now()): {
  isPast2AMTodayIST: boolean;
  today2AMUtcIso: string;
  next2AMUtcIso: string;
  msUntilNext2AMIST: number;
} {
  const istWallClock = new Date(nowMs + IST_OFFSET_MS);
  const year = istWallClock.getUTCFullYear();
  const month = istWallClock.getUTCMonth();
  const date = istWallClock.getUTCDate();

  const today2AMWallClockMs = Date.UTC(year, month, date, 2, 0, 0, 0);
  const today2AMUtcMs = today2AMWallClockMs - IST_OFFSET_MS;

  const isPast2AMTodayIST = nowMs >= today2AMUtcMs;
  const next2AMUtcMs = isPast2AMTodayIST
    ? today2AMUtcMs + 24 * 60 * 60 * 1000
    : today2AMUtcMs;

  return {
    isPast2AMTodayIST,
    today2AMUtcIso: new Date(today2AMUtcMs).toISOString(),
    next2AMUtcIso: new Date(next2AMUtcMs).toISOString(),
    msUntilNext2AMIST: Math.max(1000, next2AMUtcMs - nowMs),
  };
}

let isCatchingUpDailyCheck = false;
let lastCompletedWindowIso = "";

/**
 * Ensures that if the current time is past 2:00 AM IST today and no 'scheduled_2am'
 * diagnostic sweep has been recorded for today's 2:00 AM IST window (e.g. due to
 * serverless hibernation or container restart), it runs immediately once.
 */
export async function ensureDaily2AMCheckRan(): Promise<DiagnosticResult | null> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return null;
  }

  const { isPast2AMTodayIST, today2AMUtcIso } = get2AMISTScheduleInfo();
  if (!isPast2AMTodayIST) {
    return null;
  }

  if (isCatchingUpDailyCheck || lastCompletedWindowIso === today2AMUtcIso) {
    return null;
  }

  // Check in-memory first
  const alreadyInMemory = inMemoryHealthChecks.some(
    (chk) => chk.check_type === "scheduled_2am" && chk.executed_at >= today2AMUtcIso
  );
  if (alreadyInMemory) {
    lastCompletedWindowIso = today2AMUtcIso;
    return null;
  }

  isCatchingUpDailyCheck = true;
  try {
    if (pool) {
      try {
        const existing = await pool.query(
          `SELECT id FROM public.health_checks
           WHERE check_type = 'scheduled_2am' AND executed_at >= $1
           LIMIT 1;`,
          [today2AMUtcIso]
        );
        if (existing.rows.length > 0) {
          lastCompletedWindowIso = today2AMUtcIso;
          return null;
        }
      } catch (err: unknown) {
        console.warn("Notice checking existing scheduled_2am log (will retry next cycle):", getErrorMessage(err));
        return null;
      }
    }

    const result = await runDiagnosticSweep("scheduled_2am");
    lastCompletedWindowIso = today2AMUtcIso;
    return result;
  } finally {
    isCatchingUpDailyCheck = false;
  }
}

