import { setCorsHeaders, sendJson } from "./_shared.ts";

export default function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  return sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
}
