import { setCorsHeaders, sendJson, verifySessionToken } from "../_shared.ts";
import { sendTelegramMessage, getTelegramConfig, saveTelegramConfig } from "./_client.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed" });
  }

  // Authentication guard: prevent unauthorized users from triggering test messages
  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || !verifySessionToken(token)) {
    return sendJson(res, 401, {
      success: false,
      error: "Unauthorized: You must be logged in to send Telegram test alerts.",
    });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {}
    }

    const { botToken, chatId } = body || {};
    const config = await getTelegramConfig();

    const targetToken = botToken && !botToken.includes("••••") ? botToken.trim() : config.botToken;
    const targetChatId = chatId ? chatId.trim() : config.chatId;

    if (!targetToken) {
      return sendJson(res, 400, {
        success: false,
        error: "Please enter your Telegram Bot Token (obtained from @BotFather)",
      });
    }

    if (!targetChatId) {
      return sendJson(res, 400, {
        success: false,
        error: "Please enter your Telegram Chat ID (your personal ID or group chat ID)",
      });
    }

    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const testMessage = `
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
        error: result.error || "Failed to deliver message to Telegram. Check your Bot Token and Chat ID.",
      });
    }

    // Auto-save verified credentials
    await saveTelegramConfig({
      botToken: targetToken,
      chatId: targetChatId,
    });

    return sendJson(res, 200, {
      success: true,
      message: "Test message sent to Telegram successfully!",
      telegramResponse: result.data,
    });
  } catch (err: any) {
    return sendJson(res, 500, {
      success: false,
      error: err?.message || "Internal server error sending test message",
    });
  }
}
