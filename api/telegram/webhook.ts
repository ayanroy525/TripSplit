import crypto from "crypto";
import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared.js";
import { getTelegramConfig, getTelegramWebhookSecret, registerTelegramWebhook, saveTelegramConfig } from "./_client.js";
import { processTelegramUpdate } from "./_processor.js";
import { startTelegramPoller, recordDetectedTelegramUser } from "./_poller.js";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // Webhook info check or registration via ?url= (Strictly Admin Protected)
  if (req.method === "GET") {
    const adminAuth = await verifyAdminRequest(req);
    if (!adminAuth.authorized) {
      return sendJson(res, adminAuth.statusCode || 403, {
        success: false,
        error: adminAuth.error || "Access Denied: Restricted to application administrator.",
      });
    }
    const queryUrl = req.query?.url || "";
    if (queryUrl && typeof queryUrl === "string") {
      const trimmedUrl = queryUrl.trim();
      if (trimmedUrl.length > 512 || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmedUrl)) {
        return sendJson(res, 400, { success: false, error: "Invalid webhook URL parameter" });
      }
      try {
        await saveTelegramConfig({ webhookUrl: trimmedUrl });
        if (process.env.VERCEL || trimmedUrl.startsWith("https://")) {
          const reg = await registerTelegramWebhook(trimmedUrl);
          return sendJson(res, reg.success ? 200 : 400, {
            success: reg.success,
            status: "active",
            description: reg.description,
            error: reg.success ? undefined : "Failed to register webhook",
          });
        } else {
          startTelegramPoller().catch(() => {});
          return sendJson(res, 200, {
            success: true,
            status: "active",
            endpoint: "/api/telegram/webhook",
            description: "Telegram webhook URL saved and active listener verified!",
          });
        }
      } catch {
        return sendJson(res, 500, { success: false, error: "Internal server error configuring webhook" });
      }
    }

    return sendJson(res, 200, {
      success: true,
      status: "active",
      endpoint: "/api/telegram/webhook",
      info: "Telegram Bot Webhook endpoint is listening for verified callback queries and messages",
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed" });
  }

  // Security: Enforce secret token header verification using crypto.timingSafeEqual and fail closed if missing
  const expectedSecret = getTelegramWebhookSecret();
  if (!expectedSecret) {
    return sendJson(res, 403, {
      success: false,
      error: "Forbidden: Missing or invalid Telegram webhook secret token",
    });
  }

  const incomingSecretRaw =
    req.headers?.["x-telegram-bot-api-secret-token"] ||
    req.headers?.["X-Telegram-Bot-Api-Secret-Token"];
  const incomingSecret = typeof incomingSecretRaw === "string" ? incomingSecretRaw.trim() : "";

  const expectedBuf = Buffer.from(expectedSecret, "utf-8");
  const incomingBuf = Buffer.from(incomingSecret, "utf-8");
  const isValidSecret =
    incomingSecret.length > 0 &&
    expectedBuf.length === incomingBuf.length &&
    crypto.timingSafeEqual(expectedBuf, incomingBuf);

  if (!isValidSecret) {
    return sendJson(res, 403, {
      success: false,
      error: "Forbidden: Missing or invalid Telegram webhook secret token",
    });
  }

  try {
    let update = req.body;
    if (typeof update === "string") {
      try {
        update = JSON.parse(update);
      } catch {
        return sendJson(res, 400, { success: false, error: "Invalid webhook JSON body" });
      }
    }
    if (!update || typeof update !== "object") {
      return sendJson(res, 400, { success: false, error: "Invalid webhook update payload" });
    }

    recordDetectedTelegramUser(update);

    const config = await getTelegramConfig();
    const expectedChatId = String(process.env.TELEGRAM_CHAT_ID || config.chatId || "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();
    const incomingChatId = String(
      update?.message?.chat?.id ??
        update?.edited_message?.chat?.id ??
        update?.callback_query?.message?.chat?.id ??
        update?.callback_query?.from?.id ??
        ""
    ).trim();

    if (!expectedChatId || !incomingChatId || incomingChatId !== expectedChatId) {
      return sendJson(res, 200, { ok: true, ignored: true });
    }

    const result = await processTelegramUpdate(update);
    return sendJson(res, 200, { ok: true, ...result });
  } catch {
    return sendJson(res, 500, { success: false, error: "Internal server error processing webhook" });
  }
}
