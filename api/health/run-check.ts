import { setCorsHeaders, sendJson } from "../_shared.ts";
import { runDiagnosticSweep } from "./_runner.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
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
