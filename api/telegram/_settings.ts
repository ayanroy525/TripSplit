import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared.ts";
import { getTelegramConfig, saveTelegramConfig } from "./_client.ts";

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

  if (req.method === "GET") {
    try {
      const config = await getTelegramConfig();
      // Mask token for security
      const maskedToken = config.botToken
        ? config.botToken.slice(0, 5) + "••••••••••" + config.botToken.slice(-4)
        : "";

      return sendJson(res, 200, {
        success: true,
        config: {
          hasToken: Boolean(config.botToken),
          botTokenMasked: maskedToken,
          chatId: config.chatId,
          dailyEnabled: config.dailyEnabled,
          webhookUrl: config.webhookUrl,
        },
      });
    } catch (err: any) {
      return sendJson(res, 500, { success: false, error: err?.message });
    }
  }

  if (req.method === "POST") {

    try {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {}
      }

      const { botToken, chatId, dailyEnabled, webhookUrl } = body || {};
      const updated = await saveTelegramConfig({
        botToken: botToken !== undefined && !botToken.includes("••••") ? botToken : undefined,
        chatId,
        dailyEnabled,
        webhookUrl,
      });

      return sendJson(res, 200, {
        success: true,
        message: "Telegram configuration saved successfully",
        config: {
          hasToken: Boolean(updated.botToken),
          chatId: updated.chatId,
          dailyEnabled: updated.dailyEnabled,
          webhookUrl: updated.webhookUrl,
        },
      });
    } catch (err: any) {
      return sendJson(res, 500, { success: false, error: err?.message });
    }
  }

  return sendJson(res, 405, { success: false, error: "Method not allowed" });
}
