import { z } from "zod";
import { setCorsHeaders, sendJson, verifyAdminRequest, parseBody, validateWithSchema } from "../_shared.js";
import { sendTelegramMessage, getTelegramConfig, registerTelegramWebhook } from "./_client.js";

const testPostSchema = z.object({
  chatId: z.string().trim().regex(/^-?[A-Za-z0-9_@]{1,64}$/, "Invalid chat ID").optional().or(z.literal("")),
  customMessage: z.string().trim().max(4000, "Message is too long").optional(),
});

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed" });
  }

  const adminAuth = await verifyAdminRequest(req);
  if (!adminAuth.authorized) {
    return sendJson(res, adminAuth.statusCode || 403, {
      success: false,
      error: adminAuth.error || "Access Denied: Restricted to application administrator.",
    });
  }

  try {
    const body = parseBody(req);
    const parsed = validateWithSchema(testPostSchema, body);
    if (!parsed.success || !parsed.data) {
      return sendJson(res, 400, { success: false, error: parsed.error || "Invalid test payload" });
    }

    const { chatId, customMessage } = parsed.data;
    const config = await getTelegramConfig();

    const targetToken = config.botToken;
    const targetChatId = chatId ? chatId.trim() : config.chatId;

    if (!targetToken || !targetChatId) {
      return sendJson(res, 400, {
        success: false,
        error: "Telegram integration is not configured.",
      });
    }

    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const testMessage = customMessage
      ? customMessage.trim()
      : `
✈️ <b>TripSplit Telegram Alerts Connected!</b>

✅ <b>Status:</b> Test message delivered successfully
⏱️ <b>Time:</b> ${timestamp} IST
🤖 <b>Bot Configuration:</b> Active

<i>Your automated 2:00 AM system health checks will now be delivered to this chat. If any issues are detected, you will receive interactive approval buttons here to execute automated fixes.</i>
`.trim();

    const result = await sendTelegramMessage(testMessage, {
      customToken: targetToken,
      customChatId: targetChatId,
    });

    if (!result.success) {
      return sendJson(res, 400, {
        success: false,
        error: "Failed to deliver message to Telegram.",
      });
    }

    if (process.env.VERCEL) {
      const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
      const proto = req.headers?.["x-forwarded-proto"] || "https";
      const targetWebhook = host ? `${proto}://${host}/api/telegram/webhook` : config.webhookUrl;
      if (targetWebhook && targetWebhook.startsWith("https://")) {
        await registerTelegramWebhook(targetWebhook, targetToken).catch(() => {});
      }
    }

    return sendJson(res, 200, {
      success: true,
      message: "Test message sent to Telegram successfully!",
    });
  } catch {
    return sendJson(res, 500, {
      success: false,
      error: "Internal server error sending test message",
    });
  }
}
