import { setCorsHeaders, sendJson } from "../_shared.ts";
import { registerTelegramWebhook } from "./_client.ts";
import { processTelegramUpdate } from "./_processor.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // Webhook info check
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
