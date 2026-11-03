import { setCorsHeaders, sendJson, verifyCronOrAdminRequest } from "../_shared";
import { runDiagnosticSweep } from "../_health/_runner";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const authResult = await verifyCronOrAdminRequest(req);
  if (!authResult.authorized) {
    return sendJson(res, authResult.statusCode || 401, {
      success: false,
      error: authResult.error || "Unauthorized: Cron secret or administrator authentication required.",
    });
  }

  try {
    const result = await runDiagnosticSweep("scheduled_2am");
    return sendJson(res, 200, {
      success: true,
      message: "Daily 2:00 AM diagnostic check completed successfully",
      diagnostic: result,
    });
  } catch (err: any) {
    console.error("Error executing daily check:", err);
    return sendJson(res, 500, {
      success: false,
      error: err?.message || "Internal server error during daily check",
    });
  }
}
