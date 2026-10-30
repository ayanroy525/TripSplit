import { setCorsHeaders, sendJson } from "../_shared.ts";
import { runDiagnosticSweep } from "../health/_runner.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
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
