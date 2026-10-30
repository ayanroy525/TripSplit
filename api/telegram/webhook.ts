import { setCorsHeaders, sendJson, rateLimitRequest } from "../_shared.ts";
import { registerTelegramWebhook } from "./_client.ts";
import { processTelegramUpdate } from "./_processor.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === "GET") {
    return sendJson(res, 200, {
      status: "active",
      endpoint: "/api/telegram/webhook",
      info: "Telegram Bot Webhook endpoint is listening for verified callback queries and messages",
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed" });
  }

  const clientIp = (req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").toString();
  if (rateLimitRequest(`telegram:${clientIp}`, 20, 60_000)) {
    return sendJson(res, 429, { success: false, error: "Too many requests. Please try again later." });
  }

  const secret = req.headers?.["x-telegram-bot-api-secret-token"];
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret || !secret || secret !== expectedSecret) {
    return sendJson(res, 401, { success: false, error: "Unauthorized webhook request" });
  }

  try {
    let update = req.body;
    if (typeof update === "string") {
      try {
        update = JSON.parse(update);
      } catch {}
    }

    const result = await processTelegramUpdate(update);
    return sendJson(res, 200, result);
  } catch (err: any) {
    console.error("Error in webhook handler:", err);
    return sendJson(res, 500, { success: false, error: err?.message });
  }
}
