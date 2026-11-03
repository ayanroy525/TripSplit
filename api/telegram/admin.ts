import settingsHandler from "./_settings";
import testHandler from "./_test";
import detectChatHandler from "./_detect-chat";
import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared";

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

  const url = req.url || "";
  const queryAction = req.query?.action || "";

  if (queryAction === "settings" || url.includes("/settings")) {
    return settingsHandler(req, res);
  }
  if (queryAction === "test" || url.includes("/test")) {
    return testHandler(req, res);
  }
  if (queryAction === "detect-chat" || url.includes("/detect-chat")) {
    return detectChatHandler(req, res);
  }

  return sendJson(res, 400, {
    success: false,
    error: "Unknown admin action. Supported actions: settings, test, detect-chat",
  });
}
