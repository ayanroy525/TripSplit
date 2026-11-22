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
import userTripsHandler from "./api/user-trips";
import syncMutationHandler from "./api/sync/mutation";
import healthHandler from "./api/health";
import dbStatusHandler from "./api/db/status";
import cronDailyCheckHandler from "./api/cron/daily-check";
import telegramSettingsHandler from "./api/telegram/_settings";
import telegramTestHandler from "./api/telegram/_test";
import telegramWebhookHandler from "./api/telegram/webhook";
import telegramDetectChatHandler from "./api/telegram/_detect-chat";
import { startTelegramPoller } from "./api/telegram/_poller";
import {
  verifyAuthRequest,
  verifyAdminRequest,
  sanitizeReceiptUrl as sharedSanitizeReceiptUrl,
  setCorsHeaders,
  type SessionPayload,
} from "./api/_shared";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// CORS Whitelist Protection & Security Headers using shared strict policy
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || process.env.NODE_ENV === "production") {
    setCorsHeaders(res, req);
  }
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

// Health, DB Status, and Cron endpoints (delegated to hardened /api handlers)
app.all("/api/health", (req, res) => healthHandler(req, res));
app.all("/api/health/history", (req, res) => healthHandler(req, res));
app.all("/api/health/run-check", (req, res) => healthHandler(req, res));
app.all("/api/db/status", (req, res) => dbStatusHandler(req, res));
app.all("/api/cron/daily-check", (req, res) => cronDailyCheckHandler(req, res));

// Auth endpoints (delegated to hardened /api/auth handlers with Postgres-backed rate limiting & HttpOnly cookies)
app.all("/api/auth/login", (req, res) => loginHandler(req, res));
app.all("/api/auth/logout", (req, res) => loginHandler(req, res));
app.all("/api/auth/signup", (req, res) => signupHandler(req, res));
app.all("/api/auth/update-password", (req, res) => loginHandler(req, res));
app.all("/api/auth/revoke-all-sessions", (req, res) => loginHandler(req, res));

// User Trips & Trip CRUD / Invite endpoints (delegated to hardened /api handlers)
app.all("/api/user-trips", (req, res) => userTripsHandler(req, res));
app.all("/api/trips/invite/lookup", (req, res) => tripHandler(req, res));
app.all("/api/trips/invite/join", (req, res) => tripHandler(req, res));
app.all("/api/trips/invite/:code", (req, res) => {
  (req as any).query = { ...(req.query || {}), action: "invite-lookup", code: req.params.code };
  return tripHandler(req, res);
});
app.all("/api/trips/join", (req, res) => tripHandler(req, res));
app.all("/api/trips/link-members", (req, res) => tripHandler(req, res));
app.all("/api/trips", (req, res) => tripHandler(req, res));
app.all("/api/trips/:tripId/:resource/:itemId", (req, res) => tripHandler(req, res));
app.all("/api/trips/:tripId/:resource", (req, res) => tripHandler(req, res));
app.all("/api/trips/:tripId", (req, res) => tripHandler(req, res));

// Sync Mutation endpoint
app.all("/api/sync/mutation", (req, res) => syncMutationHandler(req, res));

// Audit PDF download (Admin only)
app.get("/api/download-audit-pdf", adminOnlyMiddleware, (_req, res) => {
  const filePath = path.resolve(__dirname, "public", "Spliito_Application_Review.pdf");
  res.download(filePath, "Spliito_Application_Review.pdf");
});

// Telegram Alerts & Webhook Endpoints
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
  } catch (err) {
    console.warn("[Scheduler] Error checking missed daily 2 AM IST check:", err);
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
      console.log("[Scheduler] Executing scheduled daily 2:00 AM IST health check sweep...");
      await runDiagnosticSweep("scheduled_2am");
    } catch (err) {
      console.error("[Scheduler] Error in daily 2:00 AM IST health check:", err);
    }
    setInterval(async () => {
      try {
        console.log("[Scheduler] Executing scheduled daily 2:00 AM IST health check sweep...");
        await runDiagnosticSweep("scheduled_2am");
      } catch (err) {
        console.error("[Scheduler] Error in daily 2:00 AM IST health check:", err);
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
        const filterTag = `<script>
(function(){
  if(typeof window!=='undefined'&&window.WebSocket){
    var OrigWS=window.WebSocket;
    var DummyWS=function(u,p){
      if(p==='vite-hmr'||(typeof u==='string'&&(u.indexOf('24678')!==-1||u.indexOf('token=')!==-1))){
        var t=new EventTarget();
        t.readyState=1;
        t.url=u;
        t.protocol='vite-hmr';
        t.send=function(){};
        t.close=function(){};
        setTimeout(function(){
          var ev=new Event('open');
          t.dispatchEvent(ev);
          if(typeof t.onopen==='function')t.onopen(ev);
        },10);
        return t;
      }
      return new OrigWS(u,p);
    };
    DummyWS.prototype=OrigWS.prototype;
    DummyWS.CONNECTING=0;DummyWS.OPEN=1;DummyWS.CLOSING=2;DummyWS.CLOSED=3;
    window.WebSocket=DummyWS;
  }
  var _e=console.error;
  console.error=function(){
    if(arguments[0]&&typeof arguments[0]==='string'&&(arguments[0].indexOf('[vite]')!==-1||arguments[0].indexOf('websocket')!==-1||arguments[0].indexOf('WebSocket')!==-1))return;
    return _e.apply(console,arguments);
  };
  var _w=console.warn;
  console.warn=function(){
    if(arguments[0]&&typeof arguments[0]==='string'&&(arguments[0].indexOf('[vite]')!==-1||arguments[0].indexOf('websocket')!==-1||arguments[0].indexOf('WebSocket')!==-1))return;
    return _w.apply(console,arguments);
  };
  window.addEventListener('unhandledrejection',function(e){
    if(e.reason&&(typeof e.reason==='string'||e.reason.message)&&(String(e.reason.message||e.reason).indexOf('[vite]')!==-1||String(e.reason.message||e.reason).indexOf('WebSocket')!==-1)){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });
})();
</script>`;
        template = template.replace("<head>", `<head>\n    ${filterTag}`);
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

  // Centralized Error Handling Middleware
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(`[Error] Request ${(req as any).id || "unknown"}:`, err?.message || err);
    if (res.headersSent) return next(err);
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
  setupServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}

export default app;
