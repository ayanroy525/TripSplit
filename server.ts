process.env.DISABLE_HMR = "true";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  runDiagnosticSweep,
  get2AMISTScheduleInfo,
  ensureDaily2AMCheckRan,
} from "./api/_health/_runner";
import loginHandler from "./api/auth/login";
import signupHandler from "./api/auth/signup";
import tripHandler from "./api/trips/[tripId]";
import syncMutationHandler from "./api/sync/mutation";
import userTripsHandler from "./api/user-trips";
import healthHandler from "./api/health";
import dbStatusHandler from "./api/db/status";
import dailyCheckHandler from "./api/cron/daily-check";
import telegramSettingsHandler from "./api/telegram/_settings";
import telegramTestHandler from "./api/telegram/_test";
import telegramWebhookHandler from "./api/telegram/webhook";
import telegramDetectChatHandler from "./api/telegram/_detect-chat";
import { startTelegramPoller } from "./api/telegram/_poller";
import {
  pool,
  verifyAuthRequest,
  verifyAdminRequest,
  sanitizeReceiptUrl as sharedSanitizeReceiptUrl,
  setCorsHeaders,
  clearSessionCookie,
  getLocalStore,
  saveLocalStore,
} from "./api/_shared";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// CORS Whitelist Protection & Security Headers using shared strict policy
app.use((req, res, next) => {
  setCorsHeaders(res, req);
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Request ID tracking for distributed observability
app.use((req, res, next) => {
  const reqId = req.headers["x-request-id"] || `req_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
  (req as any).id = reqId;
  res.setHeader("X-Request-Id", reqId as string);
  next();
});

// Body parser
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

interface SessionPayload {
  userId: string;
  email?: string;
  name?: string;
  tokenVersion?: number;
  iat: number;
  exp: number;
}

interface AuthRequest extends Request {
  userId?: string;
  session?: SessionPayload;
}

async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authResult = await verifyAuthRequest(req);
  if (!authResult.authorized || !authResult.userId) {
    return res.status(authResult.statusCode || 401).json({
      success: false,
      error: authResult.error || "Authorization token required",
    });
  }
  req.userId = authResult.userId;
  req.session = authResult.session as SessionPayload;
  next();
}

async function adminOnlyMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const adminResult = await verifyAdminRequest(req);
  if (!adminResult.authorized || !adminResult.userId) {
    return res.status(adminResult.statusCode || 403).json({
      success: false,
      error: adminResult.error || "Access Denied: Restricted to application administrator.",
    });
  }
  req.userId = adminResult.userId;
  req.session = adminResult.session as SessionPayload;
  next();
}

export const sanitizeReceiptUrl = sharedSanitizeReceiptUrl;

// Health, Cron & DB Status Endpoints (Protected by Admin / Cron Secret)
app.all("/api/health", (req, res) => healthHandler(req, res));
app.all("/api/health/history", (req, res) => {
  req.query = { ...(req.query || {}), action: "history" };
  return healthHandler(req, res);
});
app.all("/api/health/run-check", (req, res) => {
  req.query = { ...(req.query || {}), action: "run-check" };
  return healthHandler(req, res);
});
app.all("/api/cron/daily-check", (req, res) => dailyCheckHandler(req, res));
app.all("/api/db/status", (req, res) => dbStatusHandler(req, res));

// Authentication Endpoints (Postgres-backed rate limiting, Cookie Auth, CSRF & Zod Validation)
app.all("/api/auth/login", (req, res) => loginHandler(req, res));
app.all("/api/auth/logout", (req, res) => {
  req.query = { ...(req.query || {}), action: "logout" };
  return loginHandler(req, res);
});
app.all("/api/auth/signup", (req, res) => signupHandler(req, res));
app.all("/api/auth/update-password", (req, res) => {
  req.query = { ...(req.query || {}), action: "update-password" };
  return loginHandler(req, res);
});

app.post("/api/auth/revoke-all-sessions", authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  if (pool) {
    try {
      await pool.query("UPDATE public.users SET token_version = COALESCE(token_version, 1) + 1, updated_at = NOW() WHERE id = $1;", [userId]);
    } catch {
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ success: false, error: "Database unavailable" });
  }

  if (process.env.NODE_ENV !== "production") {
    const store = getLocalStore();
    const u = store.users.find((user) => user.id === userId);
    if (u) {
      (u as any).token_version = ((u as any).token_version || 1) + 1;
      saveLocalStore(store);
    }
  }

  clearSessionCookie(res);
  return res.json({ success: true, message: "All existing sessions have been revoked. Please log in again with new credentials." });
});

// User Trips & Trip Data Endpoints (Delegated to hardened Vercel serverless handlers)
app.all("/api/user-trips", (req, res) => userTripsHandler(req, res));

app.all("/api/trips/invite/lookup", (req, res) => {
  req.query = { ...(req.query || {}), action: "invite-lookup" };
  return tripHandler(req, res);
});
app.get("/api/trips/invite/:code", (req, res) => {
  req.query = { ...(req.query || {}), action: "invite-lookup", code: req.params.code };
  return tripHandler(req, res);
});
app.all("/api/trips/invite/join", (req, res) => {
  req.query = { ...(req.query || {}), action: "invite-join" };
  return tripHandler(req, res);
});
app.all("/api/trips/join", (req, res) => {
  req.query = { ...(req.query || {}), action: "invite-join" };
  return tripHandler(req, res);
});
app.all("/api/trips/link-members", (req, res) => {
  req.query = { ...(req.query || {}), action: "link-members" };
  return tripHandler(req, res);
});

app.post("/api/trips", (req, res) => tripHandler(req, res));
app.put("/api/trips", (req, res) => tripHandler(req, res));

app.all("/api/trips/:tripId/:resource/:itemId", (req, res) => tripHandler(req, res));
app.all("/api/trips/:tripId/:resource", (req, res) => tripHandler(req, res));
app.all("/api/trips/:tripId", (req, res) => tripHandler(req, res));

app.all("/api/sync/mutation", (req, res) => syncMutationHandler(req, res));

app.get("/api/download-audit-pdf", adminOnlyMiddleware, (_req, res) => {
  const filePath = path.resolve(__dirname, "public", "Spliito_Application_Review.pdf");
  res.download(filePath, "Spliito_Application_Review.pdf");
});

// Telegram Alerts & Webhook Endpoints (Admin / Secret Protected)
app.all("/api/telegram/settings", (req, res) => telegramSettingsHandler(req, res));
app.all("/api/telegram/test", (req, res) => telegramTestHandler(req, res));
app.all("/api/telegram/webhook", (req, res) => telegramWebhookHandler(req, res));
app.all("/api/telegram/detect-chat", (req, res) => telegramDetectChatHandler(req, res));

// Catch-all for any unmapped /api/* routes: enforce authentication first (401), then return JSON 404
app.all("/api/*", authMiddleware, (_req, res) => {
  return res.status(404).json({
    success: false,
    error: "API endpoint not found",
  });
});

async function checkAndRunMissedDailyCheck() {
  try {
    await ensureDaily2AMCheckRan();
  } catch {
    // Non-fatal background check
  }
}

function scheduleDailyNightCheck() {
  setTimeout(() => {
    checkAndRunMissedDailyCheck();
  }, 2000);

  const { next2AMUtcIso, msUntilNext2AMIST } = get2AMISTScheduleInfo();
  console.log(
    `[Scheduler] Daily 2:00 AM IST health check scheduled in ${Math.round(
      msUntilNext2AMIST / 60000
    )} minutes (at ${next2AMUtcIso} / 02:00 AM IST)`
  );

  setTimeout(async () => {
    try {
      await runDiagnosticSweep("scheduled_2am");
    } catch {
      // Non-fatal scheduled check
    }
    setInterval(async () => {
      try {
        await runDiagnosticSweep("scheduled_2am");
      } catch {
        // Non-fatal scheduled check
      }
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext2AMIST);

  setInterval(() => {
    checkAndRunMissedDailyCheck();
  }, 15 * 60 * 1000);
}

async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const { patchViteClient } = await import("./scripts/patch-vite-client.js");
      patchViteClient();
    } catch {}
    const fs = await import("fs");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: __dirname,
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  // Centralized Error Handling Middleware (Never leaks stack traces or SQL details)
  app.use((_err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(_err);
    return res.status(500).json({
      success: false,
      error: "An unexpected internal server error occurred.",
      requestId: (req as any).id || undefined,
    });
  });

  app.listen(PORT, () => {
    console.log(`TripSplit server running on http://localhost:${PORT}`);
    scheduleDailyNightCheck();
    startTelegramPoller();
  });
}

if (!process.env.VERCEL) {
  setupServer().catch(() => {
    console.error("Failed to start server");
  });
}

export default app;
