import { setCorsHeaders, sendJson, verifyCronOrAdminRequest } from "./_shared.js";
import type { ApiRequest, ApiResponse } from "./_types.js";
import historyHandler from "./_health/_history.js";
import runCheckHandler from "./_health/_run-check.js";
import { runDiagnosticSweep } from "./_health/_runner.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const url = req.url || "";
  const queryAction = req.query?.action || "";

  if (queryAction === "history" || url.includes("/history")) {
    return historyHandler(req, res);
  }
  if (queryAction === "run-check" || url.includes("/run-check")) {
    return runCheckHandler(req, res);
  }
  if (queryAction === "cron" || url.includes("/cron") || url.includes("/daily-check")) {
    const cronAuth = await verifyCronOrAdminRequest(req);
    if (!cronAuth.authorized) {
      return sendJson(res, cronAuth.statusCode || 401, {
        success: false,
        error: cronAuth.error || "Unauthorized cron or admin request.",
      });
    }
    try {
      const result = await runDiagnosticSweep("scheduled_2am");
      return sendJson(res, 200, {
        success: true,
        message: "Daily 2 AM IST diagnostic completed",
        diagnostic: result,
      });
    } catch {
      return sendJson(res, 500, {
        success: false,
        error: "Cron execution error",
      });
    }
  }

  const healthAuth = await verifyCronOrAdminRequest(req);
  if (!healthAuth.authorized) {
    return sendJson(res, healthAuth.statusCode || 401, {
      success: false,
      error: healthAuth.error || "Unauthorized",
    });
  }

  return sendJson(res, 200, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
