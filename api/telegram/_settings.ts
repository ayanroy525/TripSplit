import { z } from "zod";
import { setCorsHeaders, sendJson, verifyAdminRequest, parseBody, validateWithSchema } from "../_shared.js";
import { getTelegramConfig, saveTelegramConfig, registerTelegramWebhook } from "./_client.js";

const settingsPostSchema = z.object({
  dailyEnabled: z.boolean().optional(),
  webhookUrl: z.string().trim().url("Invalid webhook URL").max(512).optional().or(z.literal("")),
});

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

      if (configured && process.env.VERCEL) {
        const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
        const proto = req.headers?.["x-forwarded-proto"] || "https";
        const targetWebhook = host ? `${proto}://${host}/api/telegram/webhook` : config.webhookUrl;
        if (targetWebhook && targetWebhook.startsWith("https://")) {
          await registerTelegramWebhook(targetWebhook).catch(() => {});
        }
      }

      return sendJson(res, 200, {
        configured,
      });
    } catch {
      return sendJson(res, 500, { configured: false, error: "Failed to read Telegram settings" });
    }
  }

  if (req.method === "POST") {
    try {
      const body = parseBody(req);
      const parsed = validateWithSchema(settingsPostSchema, body);
      if (!parsed.success || !parsed.data) {
        return sendJson(res, 400, { configured: false, error: parsed.error || "Invalid settings payload" });
      }

      const { dailyEnabled, webhookUrl } = parsed.data;
      const updated = await saveTelegramConfig({
        dailyEnabled,
        webhookUrl,
      });

      if (updated.botToken && webhookUrl && process.env.VERCEL && webhookUrl.startsWith("https://")) {
        await registerTelegramWebhook(webhookUrl).catch(() => {});
      }

      return sendJson(res, 200, {
        configured: Boolean(updated.botToken && updated.chatId),
      });
    } catch {
      return sendJson(res, 500, { configured: false, error: "Failed to save Telegram settings" });
    }
  }

  return sendJson(res, 405, { configured: false, error: "Method not allowed" });
}
