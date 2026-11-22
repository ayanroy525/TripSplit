import { z } from "zod";
import { setCorsHeaders, sendJson, verifyAdminRequest, timingSafeCompare, logSecurityEvent, getClientIp } from "../_shared.js";
import { getTelegramConfig, getTelegramWebhookSecret, registerTelegramWebhook, saveTelegramConfig } from "./_client.js";
import { processTelegramUpdate } from "./_processor.js";
import { startTelegramPoller, recordDetectedTelegramUser } from "./_poller.js";

const webhookUrlQuerySchema = z.string().trim().url("Invalid webhook URL").max(512);

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
      const parsedUrl = webhookUrlQuerySchema.safeParse(queryUrl);
      if (!parsedUrl.success) {
        return sendJson(res, 400, { success: false, error: "Invalid webhook URL parameter" });
      }
      const cleanUrl = parsedUrl.data;
      if (!cleanUrl.startsWith("https://") && process.env.NODE_ENV === "production") {
        return sendJson(res, 400, { success: false, error: "Webhook URL must use HTTPS" });
      }
      try {
        await saveTelegramConfig({ webhookUrl: cleanUrl });
        if (process.env.VERCEL || cleanUrl.startsWith("https://")) {
          const reg = await registerTelegramWebhook(cleanUrl);
          return sendJson(res, reg.success ? 200 : 400, {
            success: reg.success,
            status: "active",
            description: reg.description,
            error: reg.error,
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
        return sendJson(res, 500, { success: false, error: "Failed to configure Telegram webhook" });
      }
    }

    return sendJson(res, 200, {
      success: true,
      status: "active",
      endpoint: "/api/telegram/webhook",
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed" });
  }

  // Security: Fail closed if secret token is not configured; verify in constant time
  const expectedSecret = getTelegramWebhookSecret();
  if (!expectedSecret) {
    logSecurityEvent("PERMISSION_DENIED", {
      scope: "TELEGRAM_WEBHOOK_SECRET_MISSING",
      ip: getClientIp(req),
    });
    return sendJson(res, 503, {
      success: false,
      error: "Telegram webhook secret is not configured",
    });
  }

  const incomingSecretRaw =
    req.headers?.["x-telegram-bot-api-secret-token"] ||
    req.headers?.["X-Telegram-Bot-Api-Secret-Token"];
  const incomingSecret = typeof incomingSecretRaw === "string" ? incomingSecretRaw.trim() : "";

  if (!timingSafeCompare(incomingSecret, expectedSecret)) {
    logSecurityEvent("PERMISSION_DENIED", {
      scope: "TELEGRAM_WEBHOOK_INVALID_SECRET",
      ip: getClientIp(req),
    });
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
        return sendJson(res, 400, { success: false, error: "Invalid webhook payload" });
      }
    }
    if (!update || typeof update !== "object") {
      return sendJson(res, 400, { success: false, error: "Invalid webhook payload" });
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
    console.error("Error in Telegram webhook handler");
    return sendJson(res, 500, { success: false, error: "Webhook processing error" });
  }
}
