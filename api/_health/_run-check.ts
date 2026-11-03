import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared";
import { runDiagnosticSweep } from "./_runner";

export default async function handler(req: any, res: any) {
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
    const result = await runDiagnosticSweep("manual_trigger");
    return sendJson(res, 200, {
      success: true,
      diagnostic: result,
    });
  } catch (err: any) {
    console.error("Error executing manual health check:", err);
    return sendJson(res, 500, {
      success: false,
      error: err?.message || "Internal server error during diagnostic check",
    });
  }
}
