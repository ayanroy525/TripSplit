import { pool } from "../_shared.ts";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  dailyEnabled: boolean;
  webhookUrl: string;
}

/**
 * Get current Telegram settings from DB, local store, or environment
 */
export async function getTelegramConfig(): Promise<TelegramConfig> {
  let botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  let chatId = process.env.TELEGRAM_CHAT_ID || "";
  let dailyEnabled = true;
  let webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || "";

  if (pool) {
    try {
      const res = await pool.query(
        "SELECT telegram_bot_token, telegram_chat_id, daily_telegram_enabled, webhook_url FROM public.health_checks_config WHERE id = 'default' LIMIT 1;"
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (row.telegram_bot_token) botToken = row.telegram_bot_token;
        if (row.telegram_chat_id) chatId = row.telegram_chat_id;
        if (row.daily_telegram_enabled !== undefined && row.daily_telegram_enabled !== null) {
          dailyEnabled = Boolean(row.daily_telegram_enabled);
        }
        if (row.webhook_url) webhookUrl = row.webhook_url;
      }
    } catch (err: any) {
      console.warn("Notice reading telegram config from DB:", err?.message);
    }
  }

  // Fallback to local file config if DB had no token
  if (!botToken) {
    try {
      const localFile = path.resolve(process.cwd(), "data", "telegram_config.json");
      if (fs.existsSync(localFile)) {
        const data = JSON.parse(fs.readFileSync(localFile, "utf-8"));
        if (data.botToken) botToken = data.botToken;
        if (data.chatId) chatId = data.chatId;
        if (data.dailyEnabled !== undefined) dailyEnabled = Boolean(data.dailyEnabled);
        if (data.webhookUrl) webhookUrl = data.webhookUrl;
      }
    } catch {}
  }

  return { botToken, chatId, dailyEnabled, webhookUrl };
}

/**
 * Save Telegram settings to PostgreSQL and local file store
 */
export async function saveTelegramConfig(config: Partial<TelegramConfig>): Promise<TelegramConfig> {
  const current = await getTelegramConfig();
  const updated: TelegramConfig = {
    botToken: config.botToken !== undefined ? config.botToken.trim() : current.botToken,
    chatId: config.chatId !== undefined ? config.chatId.trim() : current.chatId,
    dailyEnabled: config.dailyEnabled !== undefined ? Boolean(config.dailyEnabled) : current.dailyEnabled,
    webhookUrl: config.webhookUrl !== undefined ? config.webhookUrl.trim() : current.webhookUrl,
  };

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO public.health_checks_config (id, telegram_bot_token, telegram_chat_id, daily_telegram_enabled, webhook_url, updated_at)
         VALUES ('default', $1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE SET
           telegram_bot_token = EXCLUDED.telegram_bot_token,
           telegram_chat_id = EXCLUDED.telegram_chat_id,
           daily_telegram_enabled = EXCLUDED.daily_telegram_enabled,
           webhook_url = EXCLUDED.webhook_url,
           updated_at = NOW();`,
        [updated.botToken, updated.chatId, updated.dailyEnabled, updated.webhookUrl]
      );
    } catch (err: any) {
      console.warn("Notice saving telegram config to DB:", err?.message);
    }
  } else {
    // Only write to local file if database pool is unavailable
    try {
      const dir = path.resolve(process.cwd(), "data");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.resolve(dir, "telegram_config.json"),
        JSON.stringify(updated, null, 2),
        "utf-8"
      );
    } catch {}
  }

  return updated;
}

/**
 * Send message via Telegram Bot API
 */
export async function sendTelegramMessage(
  text: string,
  options?: {
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
    customChatId?: string;
    customToken?: string;
  }
): Promise<{ success: boolean; data?: any; error?: string }> {
  const config = await getTelegramConfig();
  const token = options?.customToken || config.botToken;
  const chatId = options?.customChatId || config.chatId;

  if (!token || !chatId) {
    return { success: false, error: "Telegram Bot Token and Chat ID must be configured" };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (options?.inlineKeyboard && options.inlineKeyboard.length > 0) {
    body.reply_markup = {
      inline_keyboard: options.inlineKeyboard,
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || "Failed to send Telegram message", data };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Edit an existing message in-place in Telegram
 */
export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>,
  customToken?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const config = await getTelegramConfig();
  const token = customToken || config.botToken;
  if (!token) return { success: false, error: "No bot token configured" };

  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  const body: any = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || "Failed to edit message", data };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Answer callback queries (button clicks) with a quiet toast in Telegram
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string,
  showAlert = false,
  customToken?: string
): Promise<{ success: boolean; error?: string }> {
  const config = await getTelegramConfig();
  const token = customToken || config.botToken;
  if (!token) return { success: false, error: "No bot token configured" };

  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
    });
    const data = await res.json();
    return { success: data.ok, error: data.description };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Get or derive secure Telegram Webhook secret token
 */
export function getTelegramWebhookSecret(): string {
  if (process.env.TELEGRAM_WEBHOOK_SECRET) {
    return process.env.TELEGRAM_WEBHOOK_SECRET.trim();
  }
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || process.env.AUTH_SECRET || "tripsplit_auth_token_secret_seed").update("telegram_webhook_secret_token").digest("hex").slice(0, 32);
}

/**
 * Register public webhook URL with Telegram Bot API
 */
export async function registerTelegramWebhook(
  webhookUrl: string,
  customToken?: string
): Promise<{ success: boolean; description?: string; error?: string }> {
  const config = await getTelegramConfig();
  const token = customToken || config.botToken;
  if (!token) return { success: false, error: "No bot token configured" };

  const secretToken = getTelegramWebhookSecret();
  const url = `https://api.telegram.org/bot${token}/setWebhook`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["callback_query", "message"],
        secret_token: secretToken,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      await saveTelegramConfig({ webhookUrl });
      return { success: true, description: data.description || "Webhook registered successfully" };
    }
    return { success: false, error: data.description || "Failed to register webhook" };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
