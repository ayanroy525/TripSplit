import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared.ts";
import { getTelegramConfig, saveTelegramConfig, sendTelegramMessage } from "./_client.ts";
import { getLastDetectedTelegramUser, recordDetectedTelegramUser } from "./_poller.ts";

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

  try {
    const config = await getTelegramConfig();
    const token = config.botToken;

    if (!token) {
      return sendJson(res, 400, {
        success: false,
        error: "No Telegram bot token found. Please save your bot token first.",
      });
    }

    let strChatId = "";
    let firstName = "Admin";
    let username = "user";
    let userId: number | string | undefined;

    // 1. Check if background poller already captured recent message
    const cachedUser = getLastDetectedTelegramUser();
    if (cachedUser?.chatId) {
      strChatId = cachedUser.chatId;
      firstName = cachedUser.firstName || "Admin";
      username = cachedUser.username || "user";
      userId = cachedUser.userId;
    }

    // 2. Try querying Telegram getUpdates if not yet detected
    if (!strChatId) {
      try {
        const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=10`);
        const updatesData = await updatesRes.json();
        if (updatesData.ok && Array.isArray(updatesData.result) && updatesData.result.length > 0) {
          const latestUpdate = updatesData.result[updatesData.result.length - 1];
          recordDetectedTelegramUser(latestUpdate);
          const message = latestUpdate.message || latestUpdate.callback_query?.message;
          const user = latestUpdate.message?.from || latestUpdate.callback_query?.from;
          const detectedId = message?.chat?.id || user?.id;
          if (detectedId) {
            strChatId = String(detectedId);
            firstName = user?.first_name || message?.chat?.first_name || "Admin";
            username = user?.username || message?.chat?.username || "user";
            userId = user?.id || detectedId;
          }
        }
      } catch {}
    }

    // 3. Fallback to already saved chatId in DB config if present
    if (!strChatId && config.chatId) {
      strChatId = String(config.chatId).trim();
    }

    if (!strChatId) {
      return sendJson(res, 200, {
        success: false,
        detected: false,
        message: "No messages found yet. Please open t.me/TripSplitMonitorBot in Telegram and tap 'START' or send any message.",
      });
    }

    // Auto-save detected chatId
    await saveTelegramConfig({ chatId: strChatId });

    // Send instant welcome confirmation
    const welcomeText = `
🎉 <b>TripSplit Bot Connected Successfully!</b>

Hello <b>${firstName}</b> (@${username}),
Your Telegram Chat ID (<code>${strChatId}</code>) is now linked to <b>TripSplit System Monitor</b>.

• <b>Daily Health Sweep:</b> Scheduled every night at 2:00 AM
• <b>Interactive Consents:</b> If any database issue occurs, you will receive interactive buttons right here to approve automated fixes!
• <b>Commands:</b> Type <code>/health</code> or <code>/status</code> anytime to inspect system status.
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
        id: userId || strChatId,
        name: firstName,
        username,
      },
      message: `Successfully connected to ${firstName} (Chat ID: ${strChatId})! Confirmation sent to your Telegram.`,
    });
  } catch (err: any) {
    return sendJson(res, 500, {
      success: false,
      error: err?.message || "Internal server error detecting chat ID",
    });
  }
}
