import { getTelegramConfig } from "./_client.js";
import { processTelegramUpdate } from "./_processor.js";
import { getErrorMessage } from "../_types.js";
import type { TelegramApiResponse, TelegramUpdate } from "../_types.js";

let isPolling = false;
let shouldStop = false;
let lastUpdateId = 0;

export interface DetectedTelegramUser {
  chatId: string;
  userId?: number | string;
  firstName?: string;
  username?: string;
  updatedAt: number;
}

let lastDetectedUser: DetectedTelegramUser | null = null;

export function recordDetectedTelegramUser(update: TelegramUpdate) {
  const msg = update?.message || update?.callback_query?.message;
  const from = update?.message?.from || update?.callback_query?.from;
  const chatId = msg?.chat?.id || from?.id;
  if (chatId) {
    lastDetectedUser = {
      chatId: String(chatId),
      userId: from?.id,
      firstName: from?.first_name || msg?.chat?.first_name || "Admin",
      username: from?.username || msg?.chat?.username || "user",
      updatedAt: Date.now(),
    };
  }
}

export function getLastDetectedTelegramUser(): DetectedTelegramUser | null {
  return lastDetectedUser;
}

/**
 * Start background long-polling for Telegram bot updates
 * This guarantees instant button click responses in dev, preview, and server environments
 * without requiring inbound public webhooks.
 */
export async function startTelegramPoller() {
  if (isPolling) {
    return;
  }

  isPolling = true;
  shouldStop = false;

  const config = await getTelegramConfig();
  const token = config.botToken;

  if (!token) {
    isPolling = false;
    return;
  }

  // Do not delete active webhooks; if a webhook is registered (e.g. on Vercel), let the webhook handle updates
  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const infoData = await infoRes.json();
    if (infoData?.ok && infoData?.result?.url) {
      isPolling = false;
      return;
    }
  } catch (e: unknown) {
    console.warn("[Telegram Poller] Notice checking webhook info:", getErrorMessage(e));
  }

  // Poll loop
  (async () => {
    while (!shouldStop) {
      try {
        const currentConfig = await getTelegramConfig();
        const currentToken = currentConfig.botToken || token;

        const url = `https://api.telegram.org/bot${currentToken}/getUpdates?offset=${lastUpdateId ? lastUpdateId + 1 : 0}&timeout=15&allowed_updates=["callback_query","message"]`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = (await res.json()) as TelegramApiResponse<TelegramUpdate[]>;
          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              if (typeof update.update_id === "number") {
                lastUpdateId = Math.max(lastUpdateId, update.update_id);
              }
              recordDetectedTelegramUser(update);
              try {
                await processTelegramUpdate(update);
              } catch (updateErr: unknown) {
                console.error("[Telegram Poller] Error handling update:", getErrorMessage(updateErr));
              }
            }
          }
        } else {
          // If 409 Conflict, a webhook is active on Telegram (e.g. Vercel deployment); stop polling instead of deleting the webhook
          if (res.status === 409) {
            shouldStop = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          console.warn("[Telegram Poller] Polling cycle notice:", getErrorMessage(err));
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    isPolling = false;
  })();
}

export function stopTelegramPoller() {
  shouldStop = true;
}
