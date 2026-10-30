import dotenv from "dotenv";
dotenv.config();

import { getTelegramConfig } from "../api/telegram/_client.ts";
import { processTelegramUpdate } from "../api/telegram/_processor.ts";

let lastUpdateId = 0;

async function runDaemon() {
  console.log("[Telegram Daemon] Initializing continuous background bot listener...");

  const config = await getTelegramConfig();
  const token = config.botToken || "9015395099:AAGwac8hrD0yAzmr_K_8dmokp1qIU2X3zZw";

  // 1. Reset webhook so long-polling is unlocked
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    const data = await res.json();
    console.log("[Telegram Daemon] Webhook cleared:", data.description || data.ok);
  } catch (err: any) {
    console.warn("[Telegram Daemon] Could not delete webhook:", err?.message);
  }

  console.log("[Telegram Daemon] Actively listening for button clicks and commands...");

  while (true) {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId ? lastUpdateId + 1 : 0}&timeout=10&allowed_updates=["callback_query","message"]`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            console.log(`[Telegram Daemon] Received update ID: ${update.update_id}`);
            try {
              await processTelegramUpdate(update);
            } catch (procErr: any) {
              console.error("[Telegram Daemon] Error processing update:", procErr?.message);
            }
          }
        }
      } else {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (cycleErr: any) {
      console.warn("[Telegram Daemon] Polling cycle notice:", cycleErr?.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

runDaemon().catch((e) => {
  console.error("[Telegram Daemon] Fatal error:", e);
});
