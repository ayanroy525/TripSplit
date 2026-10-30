import { DiagnosticResult } from "../health/_runner.ts";

/**
 * Format a diagnostic sweep result for Telegram HTML message
 */
export function formatDiagnosticTelegramReport(
  diag: DiagnosticResult,
  webhookUrl?: string
): { text: string; inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>> } {
  const isHealthy = diag.status === "nominal";
  const dateStr = new Date(diag.executed_at).toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const counts = diag.table_counts || ({} as any);
  const tablesFormatted = `
<b>Database Tables Verified:</b>
<code>• users:        ${counts.users ?? 0}</code>
<code>• trips:        ${counts.trips ?? 0}</code>
<code>• members:      ${counts.trip_members ?? 0}</code>
<code>• expenses:     ${counts.expenses ?? 0}</code>
<code>• payments:     ${counts.payments ?? 0}</code>
<code>• activities:   ${counts.activities ?? 0}</code>
`.trim();

  if (isHealthy) {
    const text = `
🟢 <b>TripSplit Daily Health Check: NOMINAL</b>

<b>Time:</b> ${dateStr} IST (${diag.check_type})
<b>DB Latency:</b> <code>${diag.latency_ms}ms</code>
<b>Auth & RPCs:</b> ✅ Functional

${tablesFormatted}

<i>All system endpoints, Supabase database connections, and authentication lookup functions are operating normally.</i>
`.trim();

    return { text };
  }

  // Degraded or Offline Alert
  const issueHeadline = diag.status === "offline" ? "DATABASE CONNECTION OFFLINE" : "SYSTEM DEGRADED / ISSUES DETECTED";
  const errDesc = diag.error_details || "Unexpected failure during diagnostic check";

  const text = `
🔴 <b>TripSplit System Alert: ${issueHeadline}</b>

<b>Time:</b> ${dateStr} IST
<b>Status:</b> <b>${diag.status.toUpperCase()}</b>
<b>DB Latency:</b> <code>${diag.latency_ms}ms</code>
<b>Auth Check:</b> ${diag.auth_ok ? "✅ OK" : "❌ FAILED"}
<b>RPC Check:</b> ${diag.rpc_ok ? "✅ OK" : "❌ FAILED"}

${tablesFormatted}

⚠️ <b>Root Cause:</b>
<code>${escapeHtml(errDesc)}</code>

🛠️ <b>Proposed Auto-Fix:</b>
1. Re-declare <code>SECURITY DEFINER</code> and re-grant execution on <code>public.lookup_user_for_auth</code> and <code>public.get_user_trips_data</code> to anon/authenticated.
2. Flush and test database connection pool.
3. Verify and re-grant permissions on all 8 application tables.

<i>Do you approve executing this automated self-healing fix?</i>
`.trim();

  const inlineKeyboard = [
    [
      { text: "✅ Approve Auto-Fix", callback_data: `approve:${diag.id}` },
      { text: "❌ Reject / Report Only", callback_data: `reject:${diag.id}` },
    ],
  ];

  return { text, inlineKeyboard };
}

/**
 * Format message when auto-fix was approved and applied
 */
export function formatFixSuccessMessage(
  diagId: string,
  actions: string[],
  newDiag?: DiagnosticResult
): string {
  const actionsList = actions.map((a) => `• ${escapeHtml(a)}`).join("\n");
  const latencyStr = newDiag ? `<b>New Latency:</b> <code>${newDiag.latency_ms}ms</code>\n<b>New Status:</b> <b>${newDiag.status.toUpperCase()}</b>` : "";

  return `
✅ <b>TripSplit Auto-Fix: EXECUTED & RESOLVED</b>

<b>Approved by Admin:</b> ${new Date().toLocaleTimeString()}
<b>Target Diagnostic:</b> <code>${diagId}</code>

<b>Actions Performed:</b>
${actionsList}

${latencyStr}

🎉 <i>All database RPCs, functions, and table permissions were successfully restored!</i>
`.trim();
}

/**
 * Format message when auto-fix was rejected
 */
export function formatFixRejectedMessage(diagId: string): string {
  return `
⚠️ <b>TripSplit Auto-Fix: REJECTED</b>

<b>Action:</b> Rejected by Admin at ${new Date().toLocaleTimeString()}
<b>Target Diagnostic:</b> <code>${diagId}</code>

<i>No changes were made to the database. The issue has been preserved in the system health log for manual inspection.</i>
`.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
