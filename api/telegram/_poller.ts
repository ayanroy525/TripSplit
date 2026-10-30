import { getTelegramConfig } from "./_client.ts";
import { processTelegramUpdate } from "./_processor.ts";

let isPolling = false;
let shouldStop = false;
let lastUpdateId = 0;

/**
 * Start background long-polling for Telegram bot updates
 * This guarantees instant button click responses in dev, preview, and server environments
 * without requiring inbound public webhooks.
 */
export async function startTelegramPoller() {
  if (isPolling) {
    console.log("[Telegram Poller] Already running.");
    return;
  }

  isPolling = true;
  shouldStop = false;
  console.log("[Telegram Poller] Starting background update listener...");

  const config = await getTelegramConfig();
  const token = config.botToken;

  if (!token) {
    console.log("[Telegram Poller] No bot token configured yet. Waiting for configuration.");
    isPolling = false;
    return;
  }

  // Ensure webhook is deleted so getUpdates receives callback_query buttons immediately
  try {
    const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    const delData = await delRes.json();
    console.log("[Telegram Poller] Webhook reset for long-polling:", delData.description || delData.ok);
  } catch (e: any) {
    console.warn("[Telegram Poller] Notice resetting webhook:", e?.message);
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
          const data = await res.json();
          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              lastUpdateId = Math.max(lastUpdateId, update.update_id);
              try {
                await processTelegramUpdate(update);
              } catch (updateErr: any) {
                console.error("[Telegram Poller] Error handling update:", updateErr?.message);
              }
            }
          }
        } else {
          // If 409 Conflict (e.g. webhook was set elsewhere), wait 5s
          await new Promise((r) => setTimeout(r, 5000));
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.warn("[Telegram Poller] Polling cycle notice:", err?.message);
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    isPolling = false;
    console.log("[Telegram Poller] Stopped.");
  })();
}

export function stopTelegramPoller() {
  shouldStop = true;
}
