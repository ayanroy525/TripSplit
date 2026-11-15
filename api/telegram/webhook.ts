import crypto from "crypto";
import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared.js";
import { getTelegramWebhookSecret, registerTelegramWebhook, saveTelegramConfig } from "./_client.js";
import { processTelegramUpdate } from "./_processor.js";
import { startTelegramPoller } from "./_poller.js";

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
      try {
        await saveTelegramConfig({ webhookUrl: queryUrl.trim() });
        if (process.env.VERCEL) {
          const reg = await registerTelegramWebhook(queryUrl.trim());
          return sendJson(res, reg.success ? 200 : 400, {
            success: reg.success,
            status: "active",
            description: reg.description,
            error: reg.error,
          });
        } else {
          // In persistent server mode, keep long-polling active so callbacks & commands work through any proxy
          startTelegramPoller().catch(() => {});
          return sendJson(res, 200, {
            success: true,
            status: "active",
            endpoint: "/api/telegram/webhook",
            description: "Telegram webhook URL saved and active listener verified!",
          });
        }
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err?.message });
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

  // Security: Enforce secret token header verification using crypto.timingSafeEqual
  const expectedSecret = getTelegramWebhookSecret();
  const incomingSecretRaw =
    req.headers?.["x-telegram-bot-api-secret-token"] ||
    req.headers?.["X-Telegram-Bot-Api-Secret-Token"];
  const incomingSecret = typeof incomingSecretRaw === "string" ? incomingSecretRaw : "";

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
      } catch {}
    }

    const expectedChatId = (process.env.TELEGRAM_CHAT_ID || "").trim().replace(/^["']|["']$/g, "").trim();
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
  } catch (err: any) {
    console.error("Error in webhook handler:", err);
    return sendJson(res, 500, { success: false, error: err?.message });
  }
}
