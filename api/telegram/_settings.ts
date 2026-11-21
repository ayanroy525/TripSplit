import { setCorsHeaders, sendJson, verifyAdminRequest } from "../_shared.js";
import { getTelegramConfig, saveTelegramConfig, registerTelegramWebhook } from "./_client.js";
import { z } from "zod";

const settingsPostSchema = z.object({
  dailyEnabled: z.boolean().optional(),
  dailyReportEnabled: z.boolean().optional(),
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
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          return sendJson(res, 400, { configured: false, error: "Invalid JSON body" });
        }
      }

      const parsed = settingsPostSchema.safeParse(body || {});
      if (!parsed.success) {
        return sendJson(res, 400, {
          configured: false,
          error: parsed.error.issues?.[0]?.message || "Invalid Telegram settings payload",
        });
      }

      const { dailyEnabled, dailyReportEnabled, webhookUrl } = parsed.data;
      const updated = await saveTelegramConfig({
        dailyEnabled: dailyEnabled ?? dailyReportEnabled,
        webhookUrl,
      });

      if (updated.botToken && webhookUrl && process.env.VERCEL && String(webhookUrl).startsWith("https://")) {
        await registerTelegramWebhook(String(webhookUrl).trim()).catch(() => {});
      }

      return sendJson(res, 200, {
        configured: Boolean(updated.botToken && updated.chatId),
      });
    } catch {
      return sendJson(res, 500, { configured: false, error: "Failed to update Telegram settings" });
    }
  }

  return sendJson(res, 405, { configured: false, error: "Method not allowed" });
}
