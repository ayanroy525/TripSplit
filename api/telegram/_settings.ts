import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared.js";
import { getTelegramConfig, saveTelegramConfig, registerTelegramWebhook } from "./_client.js";

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

  if (req.method === "GET") {
    try {
      const config = await getTelegramConfig();
      const configured = Boolean(config.botToken && config.chatId);

      // On Vercel, automatically ensure the webhook is registered with the current secret token
      if (configured && process.env.VERCEL) {
        const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
        const proto = req.headers?.["x-forwarded-proto"] || "https";
        const targetWebhook = config.webhookUrl || (host ? `${proto}://${host}/api/telegram/webhook` : "");
        if (targetWebhook && targetWebhook.startsWith("https://")) {
          registerTelegramWebhook(targetWebhook).catch(() => {});
        }
      }

      return sendJson(res, 200, {
        configured,
      });
    } catch (err: any) {
      return sendJson(res, 500, { configured: false, error: err?.message });
    }
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {}
      }

      const { dailyEnabled, webhookUrl } = body || {};
      const updated = await saveTelegramConfig({
        dailyEnabled,
        webhookUrl,
      });

      if (updated.botToken && webhookUrl && process.env.VERCEL && String(webhookUrl).startsWith("https://")) {
        await registerTelegramWebhook(String(webhookUrl).trim()).catch(() => {});
      }

      return sendJson(res, 200, {
        configured: Boolean(updated.botToken && updated.chatId),
      });
    } catch (err: any) {
      return sendJson(res, 500, { configured: false, error: err?.message });
    }
  }

  return sendJson(res, 405, { configured: false, error: "Method not allowed" });
}
