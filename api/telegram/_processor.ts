import {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
  getTelegramConfig,
} from "./_client.ts";
import { executeComprehensiveHeal } from "./_healer.ts";
import {
  formatFixSuccessMessage,
  formatFixRejectedMessage,
  formatDiagnosticTelegramReport,
} from "./_formatter.ts";
import { runDiagnosticSweep } from "../health/_runner.ts";

export async function processTelegramUpdate(update: any): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    const config = await getTelegramConfig();

    // 1. User clicked an inline button: callback_query
    if (update?.callback_query) {
      const cb = update.callback_query;
      const callbackId = cb.id;
      const data = cb.data || "";
      const message = cb.message;
      const chatId = message?.chat?.id;
      const senderId = cb?.from?.id;
      const messageId = message?.message_id;

      // Authorization guard: verify sender matches authorized admin chat
      if (config.chatId && (String(chatId) !== String(config.chatId) && String(senderId) !== String(config.chatId))) {
        console.warn(`[Telegram] Unauthorized callback attempt from sender ${senderId} / chat ${chatId}`);
        await answerCallbackQuery(callbackId, "⛔ Access Denied: You are not an authorized administrator.", true);
        return { success: false, error: "Unauthorized Telegram user" };
      }

      console.log(`[Telegram] Processing verified button click: ${data} from chat ${chatId}`);

      if (data.startsWith("approve:")) {
        const diagId = data.replace("approve:", "");
        // 1. Instant visual toast in Telegram app
        await answerCallbackQuery(callbackId, "⚙️ Auto-Fix approved! Executing self-healing scripts...", false);

        // 2. Execute self-healing repairs
        const healResult = await executeComprehensiveHeal();

        // 3. Re-run diagnostic sweep to confirm status
        const freshDiag = await runDiagnosticSweep("telegram_post_heal");

        // 4. Format updated text
        const resolvedText = formatFixSuccessMessage(diagId, healResult.actionsPerformed, freshDiag);

        // 5. Edit original message in Telegram to replace buttons with success confirmation
        if (chatId && messageId) {
          await editTelegramMessage(chatId, messageId, resolvedText);
        }

        console.log(`[Telegram] Auto-fix completed & verified for diagnostic ${diagId}`);
        return { success: true, action: "approved" };
      }

      if (data.startsWith("reject:")) {
        const diagId = data.replace("reject:", "");
        // 1. Instant toast
        await answerCallbackQuery(callbackId, "❌ Auto-Fix cancelled. No changes made.", false);

        // 2. Format rejected text
        const rejectedText = formatFixRejectedMessage(diagId);

        // 3. Edit original message in Telegram to replace buttons with rejected notice
        if (chatId && messageId) {
          await editTelegramMessage(chatId, messageId, rejectedText);
        }

        console.log(`[Telegram] Auto-fix rejected for diagnostic ${diagId}`);
        return { success: true, action: "rejected" };
      }

      await answerCallbackQuery(callbackId, "Action acknowledged");
      return { success: true, action: "unknown_callback" };
    }

    // 2. Direct chat messages (/health, /status, /start, /help)
    if (update?.message && update.message.text) {
      const text = update.message.text.trim().toLowerCase();
      const chatId = update.message.chat?.id;

      if (text.startsWith("/health") || text.startsWith("/status") || text.startsWith("/check")) {
        if (config.chatId && String(chatId) !== String(config.chatId)) {
          await sendTelegramMessage("⛔ <b>Access Denied</b>\n\nYou are not authorized to view TripSplit system diagnostics.", {
            customChatId: String(chatId),
          });
          return { success: false, error: "Unauthorized chat ID" };
        }

        const diag = await runDiagnosticSweep("telegram_on_demand");
        const report = formatDiagnosticTelegramReport(diag);
        await sendTelegramMessage(report.text, {
          customChatId: String(chatId),
          inlineKeyboard: report.inlineKeyboard,
        });
        return { success: true, action: "command_health" };
      }

      if (text.startsWith("/start") || text.startsWith("/help")) {
        const helpText = `
👋 <b>Welcome to TripSplit Health Monitor Bot!</b>

I monitor your group travel expense database, table integrity, and authentication endpoints 24/7.

<b>Available Commands:</b>
• <code>/health</code> - Run an instant diagnostic check
• <code>/status</code> - View current database table counts & latency

<i>Every night at 2:00 AM, I perform an automated sweep. If any issues are found, I will send you an alert with interactive buttons to approve automated repairs.</i>
`.trim();
        await sendTelegramMessage(helpText, { customChatId: String(chatId) });
        return { success: true, action: "command_help" };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Telegram] Error processing update:", err);
    return { success: false, error: err?.message };
  }
}
