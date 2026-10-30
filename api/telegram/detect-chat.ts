import { setCorsHeaders, sendJson } from "../_shared.ts";
import { getTelegramConfig, saveTelegramConfig, sendTelegramMessage } from "./_client.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const config = await getTelegramConfig();
    const token = config.botToken;

    if (!token) {
      return sendJson(res, 400, {
        success: false,
        error: "No Telegram bot token found. Please save your bot token first.",
      });
    }

    // Call getUpdates to see recent incoming messages to the bot
    const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=10`);
    const updatesData = await updatesRes.json();

    if (!updatesData.ok) {
      return sendJson(res, 400, {
        success: false,
        error: updatesData.description || "Failed to query Telegram updates",
      });
    }

    const updates = updatesData.result || [];
    if (updates.length === 0) {
      return sendJson(res, 200, {
        success: false,
        detected: false,
        message: "No messages found yet. Please open t.me/TripSplitMonitorBot in Telegram and tap 'START' or send any message.",
      });
    }

    // Find the latest message or callback query
    const latestUpdate = updates[updates.length - 1];
    const message = latestUpdate.message || latestUpdate.callback_query?.message;
    const user = latestUpdate.message?.from || latestUpdate.callback_query?.from;
    const chatId = message?.chat?.id || user?.id;

    if (!chatId) {
      return sendJson(res, 200, {
        success: false,
        detected: false,
        message: "Could not identify chat ID from recent updates. Please send /start to the bot.",
      });
    }

    const strChatId = String(chatId);
    // Auto-save detected chatId
    await saveTelegramConfig({ chatId: strChatId });

    // Send instant welcome confirmation
    const welcomeText = `
🎉 <b>TripSplit Bot Connected Successfully!</b>

Hello <b>${user?.first_name || "Admin"}</b> (@${user?.username || "user"}),
Your Telegram Chat ID (<code>${strChatId}</code>) is now linked to <b>TripSplit System Monitor</b>.

• <b>Daily Health Sweep:</b> Scheduled every night at 2:00 AM
• <b>Interactive Consents:</b> If any database issue occurs, you will receive interactive buttons right here to approve automated fixes!
• <b>Commands:</b> Type <code>/health</code> anytime to inspect system status.
`.trim();

    await sendTelegramMessage(welcomeText, {
      customToken: token,
      customChatId: strChatId,
    });

    return sendJson(res, 200, {
      success: true,
      detected: true,
      chatId: strChatId,
      user: {
        id: user?.id,
        name: user?.first_name,
        username: user?.username,
      },
      message: `Successfully connected to ${user?.first_name || "user"} (Chat ID: ${strChatId})! Confirmation sent to your Telegram.`,
    });
  } catch (err: any) {
    return sendJson(res, 500, {
      success: false,
      error: err?.message || "Internal server error detecting chat ID",
    });
  }
}
