import { setCorsHeaders, sendJson } from "./_shared.ts";
import historyHandler from "./health/_history.ts";
import runCheckHandler from "./health/_run-check.ts";

export default async function handler(req: any, res: any) {
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

  return sendJson(res, 200, {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "TripSplit Health & API Gateway",
  });
}
