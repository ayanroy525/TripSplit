import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared.js";
import type { ApiRequest, ApiResponse } from "../_types.js";
import { runDiagnosticSweep } from "./_runner.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
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
  } catch {
    console.error("Error executing manual health check");
    return sendJson(res, 500, {
      success: false,
      error: "Internal server error during diagnostic check",
    });
  }
}
