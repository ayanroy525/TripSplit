import { setCorsHeaders, sendJson, verifySessionToken } from "../_shared.ts";
import { getTelegramConfig, saveTelegramConfig } from "./_client.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
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
    // Authentication guard: prevent unauthorized users from changing bot config
    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token || !verifySessionToken(token)) {
      return sendJson(res, 401, {
        success: false,
        error: "Unauthorized: You must be logged in to modify Telegram notification settings.",
      });
    }

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
