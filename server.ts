process.env.DISABLE_HMR = "true";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import crypto from "crypto";
import {
  getLocalStore,
  saveLocalStore,
  findLocalUser,
  findLocalMember,
  saveLocalUser,
  getFullTripsForUser,
  LocalUserRecord,
} from "./src/serverDb.js";
import {
  runDiagnosticSweep,
  inMemoryHealthChecks,
  get2AMISTScheduleInfo,
  ensureDaily2AMCheckRan,
} from "./api/_health/_runner";
import loginHandler from "./api/auth/login";
import signupHandler from "./api/auth/signup";
import tripHandler from "./api/trips/[tripId]";
import syncMutationHandler from "./api/sync/mutation";
import telegramSettingsHandler from "./api/telegram/_settings";
import telegramTestHandler from "./api/telegram/_test";
import telegramWebhookHandler from "./api/telegram/webhook";
import telegramDetectChatHandler from "./api/telegram/_detect-chat";
import { startTelegramPoller } from "./api/telegram/_poller";
import rateLimit from "express-rate-limit";
import {
  pool,
  hashPasswordNode,
  verifyPasswordMatchNode,
  verifySessionToken as verifySharedSessionToken,
  verifyAuthRequest,
  verifyAdminRequest,
  verifyCronOrAdminRequest,
  checkTripAuthorization,
  sanitizeReceiptUrl as sharedSanitizeReceiptUrl,
  setCorsHeaders,
  isOriginAllowed,
  getValidatedSessionSecret,
  generateSecureInviteCode,
  getDefaultInviteExpiryIso,
  SESSION_SECRET,
  PASSWORD_SALT,
  ADMIN_EMAILS,
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

// Brute-force & credential stuffing defense rate limiter
const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1-minute window
  max: 10, // Max 10 attempts per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: "Too many authentication attempts from this IP. Please wait a minute before trying again.",
  },
});

const inviteRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1-minute window
  max: 25, // Max 25 invite lookups/joins per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: "Too many invite code requests from this IP. Please wait a minute before trying again.",
  },
});

app.use("/api/auth/login", authRateLimiter);
app.use("/api/auth/signup", authRateLimiter);
app.use("/api/trips/invite", inviteRateLimiter);
app.use("/api/trips/join", inviteRateLimiter);

interface SessionPayload {
  userId: string;
  email?: string;
  name?: string;
  tokenVersion?: number;
  iat: number;
  exp: number;
}

function generateSessionToken(userId: string, email?: string, name?: string, tokenVersion: number = 1): string {
  const secret = getValidatedSessionSecret();
  const payload: SessionPayload = {
    userId,
    email,
    name,
    tokenVersion,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };

  const headerBase64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${headerBase64}.${payloadBase64}`)
    .digest("base64url");

  return `${headerBase64}.${payloadBase64}.${signature}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const sharedVerified = verifySharedSessionToken(token);
  if (sharedVerified) {
    return {
      userId: sharedVerified.userId,
      email: sharedVerified.email,
      name: sharedVerified.name,
      tokenVersion: (sharedVerified as any).tokenVersion,
      iat: (sharedVerified as any).iat || Math.floor(Date.now() / 1000),
      exp: sharedVerified.exp,
    };
  }
  return null;
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

async function cronOrAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const cronResult = await verifyCronOrAdminRequest(req);
  if (!cronResult.authorized) {
    return res.status(cronResult.statusCode || 401).json({
      success: false,
      error: cronResult.error || "Unauthorized cron or admin request.",
    });
  }
  req.userId = cronResult.userId;
  req.session = cronResult.session as SessionPayload;
  next();
}

export const sanitizeReceiptUrl = sharedSanitizeReceiptUrl;

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/db/status", adminOnlyMiddleware, async (_req, res) => {
  if (!pool) {
    const localStore = getLocalStore();
    return res.json({
      connected: false,
      mode: "local_storage",
      message: "PostgreSQL is not configured. Using persistent local server storage.",
      tables: {
        users: localStore.users.length,
        trips: localStore.trips.length,
        trip_members: localStore.trip_members.length,
        expenses: localStore.expenses.length,
        payments: localStore.payments.length,
        activities: localStore.activities.length,
      },
      checkedAt: new Date().toISOString(),
    });
  }

  const start = Date.now();
  try {
    const verRes = await pool.query("SELECT version();");
    const latencyMs = Date.now() - start;

    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tableCounts: Record<string, number> = {};
    await Promise.all(
      tablesRes.rows.map(async (row) => {
        try {
          const countRes = await pool.query(`SELECT COUNT(*) FROM "${row.table_name}";`);
          tableCounts[row.table_name] = parseInt(countRes.rows[0].count, 10);
        } catch {
          tableCounts[row.table_name] = -1;
        }
      })
    );

    // Filter out internal system/config tables from public statistics
    delete tableCounts.health_checks_config;

    return res.json({
      connected: true,
      latencyMs,
      engine: "PostgreSQL",
      tables: tableCounts,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const localStore = getLocalStore();
    return res.json({
      connected: false,
      mode: "local_storage_fallback",
      error: err?.message || "PostgreSQL connection error",
      tables: {
        users: localStore.users.length,
        trips: localStore.trips.length,
      },
      checkedAt: new Date().toISOString(),
    });
  }
});

app.all("/api/auth/login", (req, res) => loginHandler(req, res));
app.all("/api/auth/signup", (req, res) => signupHandler(req, res));
app.all("/api/auth/update-password", (req, res) => loginHandler(req, res));

app.post("/api/auth/revoke-all-sessions", authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  if (pool) {
    try {
      await pool.query("UPDATE public.users SET token_version = COALESCE(token_version, 1) + 1, updated_at = NOW() WHERE id = $1;", [userId]);
    } catch (err: any) {
      console.warn("Notice updating token_version in pool:", err?.message || err);
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ success: false, error: "Database unavailable" });
  }

  if (process.env.NODE_ENV !== "production") {
    const store = getLocalStore();
    const u = store.users.find((u) => u.id === userId);
    if (u) {
      (u as any).token_version = ((u as any).token_version || 1) + 1;
      saveLocalStore(store);
    }
  }

  return res.json({ success: true, message: "All existing sessions have been revoked. Please log in again with new credentials." });
});

app.get("/api/trips/invite/:code", async (req, res) => {
  const code = (req.params.code || "").trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ success: false, message: "Code is required" });
  }

  if (pool) {
    try {
      const tripRes = await pool.query(
        `SELECT *,
                (SELECT COUNT(*)::int FROM public.trip_members tm WHERE tm.trip_id = public.trips.id) AS member_count
         FROM public.trips
         WHERE invite_code IS NOT NULL AND TRIM(invite_code) <> '' AND (
           UPPER(TRIM(invite_code)) = $1
           OR UPPER(TRIM(invite_code)) = 'TRIP-' || $1
           OR UPPER(TRIM(REPLACE(invite_code, 'TRIP-', ''))) = $1
         )
         LIMIT 1;`,
        [code]
      );
      const trip = tripRes.rows[0];
      if (trip) {
        if (trip.invite_expires_at && new Date(trip.invite_expires_at) < new Date()) {
          return res.status(410).json({
            success: false,
            message: "This invite code has expired. Please ask the trip organizer for a new one.",
          });
        }
        return res.json({
          success: true,
          trip: {
            title: trip.title || "Untitled Trip",
            name: trip.title || "Untitled Trip",
            memberCount: Number(trip.member_count || 0),
          },
        });
      }
      if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ success: false, message: "Invite code is invalid or expired." });
      }
    } catch (err: any) {
      console.warn("Notice: PostgreSQL invite query:", err?.message || err);
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ success: false, error: "Database unavailable" });
  }

  const store = getLocalStore();
  const trip = store.trips.find((t) => {
    const codeVal = (t.inviteCode || t.invite_code || "").trim().toUpperCase();
    return codeVal === code || codeVal === `TRIP-${code}` || codeVal.replace("TRIP-", "").trim() === code;
  });
  if (!trip) {
    return res.status(404).json({ success: false, message: "Invite code is invalid or expired." });
  }

  return res.json({
    success: true,
    trip: {
      title: trip.title || trip.name || "Untitled Trip",
      name: trip.name || trip.title || "Untitled Trip",
      memberCount: store.trip_members.filter((m) => m.trip_id === trip.id).length,
    },
  });
});

app.post("/api/trips/join", authMiddleware, async (req: AuthRequest, res) => {
  const { inviteCode, user } = req.body || {};
  const code = (inviteCode || "").trim().toUpperCase();

  if (!code || !user || !user.id) {
    return res.status(400).json({ success: false, message: "Invite code and user are required" });
  }

  if (user.id !== req.userId) {
    return res.status(403).json({ success: false, message: "Cannot join trip as another user" });
  }

  if (pool) {
    try {
      const dbRes = await pool.query("SELECT public.join_trip_by_invite_code($1, $2::jsonb) AS res;", [
        code,
        JSON.stringify(user),
      ]);
      const payload = dbRes.rows[0]?.res;
      if (payload && payload.success) {
        return res.json(payload);
      }
    } catch (err: any) {
      console.warn("Notice: PostgreSQL join trip:", err?.message || err);
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ success: false, error: "Database unavailable" });
  }

  const store = getLocalStore();
  const trip = store.trips.find((t) => t.invite_code === code);
  if (!trip) {
    return res.status(404).json({ success: false, message: "Invite code is invalid or expired." });
  }

  const alreadyMember = store.trip_members.some((m) => m.trip_id === trip.id && (m.user_id === user.id || m.id === user.id));
  if (!alreadyMember) {
    store.trip_members.push({
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      trip_id: trip.id,
      user_id: user.id,
      name: user.name || "Member",
      email: user.email || undefined,
      phone: user.phone || undefined,
      avatar_color: user.avatarColor || "#E39A2D",
      role: "member",
      joined_at: new Date().toISOString(),
    });
    saveLocalStore(store);
  }

  return res.json({ success: true, tripId: trip.id, message: "Joined trip successfully!" });
});

app.get("/api/user-trips", authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  if (pool) {
    try {
      const tripsQuery = `
        SELECT DISTINCT t.*
        FROM public.trips t
        LEFT JOIN public.trip_members tm ON tm.trip_id = t.id
        LEFT JOIN public.users u ON u.id = $1
        WHERE t.owner_id = $1
           OR t.member_user_ids @> to_jsonb($1::text)
           OR tm.user_id = $1
           OR tm.id = $1
           OR (u.email IS NOT NULL AND u.email <> '' AND LOWER(TRIM(tm.email)) = LOWER(TRIM(u.email)))
           OR (u.phone IS NOT NULL AND LENGTH(regexp_replace(u.phone, '\\D', '', 'g')) >= 7
               AND regexp_replace(COALESCE(tm.phone, ''), '\\D', '', 'g') LIKE '%' || regexp_replace(u.phone, '\\D', '', 'g') || '%')
        ORDER BY t.created_at DESC;
      `;
      const tripsRes = await pool.query(tripsQuery, [userId]);
      const trips = tripsRes.rows;

      if (trips.length === 0) {
        return res.json({ success: true, trips: [] });
      }

      // Batch-fetch all relational rows in 4 parallel queries instead of 4 * N queries
      const tripIds = trips.map((t: any) => t.id);
      const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
        pool.query("SELECT * FROM public.trip_members WHERE trip_id = ANY($1::text[]) ORDER BY joined_at ASC;", [tripIds]),
        pool.query(
          "SELECT * FROM public.expenses WHERE trip_id = ANY($1::text[]) AND COALESCE(deleted, false) = false ORDER BY created_at DESC;",
          [tripIds]
        ),
        pool.query("SELECT * FROM public.payments WHERE trip_id = ANY($1::text[]) ORDER BY created_at DESC;", [tripIds]),
        pool.query("SELECT * FROM public.activities WHERE trip_id = ANY($1::text[]) ORDER BY created_at DESC;", [tripIds]),
      ]);

      const membersByTrip = new Map<string, any[]>();
      const expensesByTrip = new Map<string, any[]>();
      const paymentsByTrip = new Map<string, any[]>();
      const activitiesByTrip = new Map<string, any[]>();

      for (const m of membersRes.rows) {
        const list = membersByTrip.get(m.trip_id) || [];
        list.push(m);
        membersByTrip.set(m.trip_id, list);
      }
      for (const e of expensesRes.rows) {
        const list = expensesByTrip.get(e.trip_id) || [];
        list.push(e);
        expensesByTrip.set(e.trip_id, list);
      }
      for (const p of paymentsRes.rows) {
        const list = paymentsByTrip.get(p.trip_id) || [];
        list.push(p);
        paymentsByTrip.set(p.trip_id, list);
      }
      for (const a of activitiesRes.rows) {
        const list = activitiesByTrip.get(a.trip_id) || [];
        if (list.length < 50) {
          list.push(a);
          activitiesByTrip.set(a.trip_id, list);
        }
      }

      const fullTrips = trips.map((trip: any) => ({
        ...trip,
        members: membersByTrip.get(trip.id) || [],
        expenses: expensesByTrip.get(trip.id) || [],
        payments: paymentsByTrip.get(trip.id) || [],
        activities: activitiesByTrip.get(trip.id) || [],
      }));

      return res.json({ success: true, trips: fullTrips });
    } catch (err: any) {
      console.warn("Notice: PostgreSQL in user-trips:", err?.message || err);
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ success: false, error: "Database unavailable" });
  }

  const userTrips = getFullTripsForUser(userId);
  return res.json({ success: true, trips: userTrips });
});

// Robust Invite Code Lookup & Preview (Returns ONLY trip name and memberCount)
app.post("/api/trips/invite/lookup", async (req, res) => {
  let { inviteCode } = req.body || {};
  let raw = String(inviteCode || "").trim();

  // Normalize: if user pasted URL or query string
  if (raw.includes("code=")) {
    const match = raw.match(/code=([^&?#]+)/);
    if (match && match[1]) raw = decodeURIComponent(match[1]);
  } else if (raw.startsWith("#join?")) {
    raw = raw.replace("#join?", "");
  }

  const clean = raw.trim().toUpperCase();
  if (!clean) {
    return res.status(400).json({ success: false, error: "Please enter an invite code." });
  }

  // 1. Try PostgreSQL (Strictly match invite_code only, never internal trip id)
  if (pool) {
    try {
      const tripRes = await pool.query(
        `SELECT *,
                (SELECT COUNT(*)::int FROM public.trip_members tm WHERE tm.trip_id = public.trips.id) AS member_count
         FROM public.trips
         WHERE invite_code IS NOT NULL AND TRIM(invite_code) <> '' AND (
           UPPER(TRIM(invite_code)) = $1
           OR UPPER(TRIM(invite_code)) = 'TRIP-' || $1
           OR UPPER(TRIM(REPLACE(invite_code, 'TRIP-', ''))) = $1
         )
         LIMIT 1;`,
        [clean]
      );

      const trip = tripRes.rows[0];
      if (trip) {
        if (trip.invite_expires_at && new Date(trip.invite_expires_at) < new Date()) {
          return res.status(410).json({
            success: false,
            error: "This invite code has expired. Please ask the trip organizer for a new one.",
          });
        }

        return res.json({
          success: true,
          trip: {
            title: trip.title || "Untitled Trip",
            name: trip.title || "Untitled Trip",
            memberCount: Number(trip.member_count || 0),
          },
        });
      }
      if (process.env.NODE_ENV === "production") {
        return res.status(404).json({
          success: false,
          error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
        });
      }
    } catch (err: any) {
      console.warn("PostgreSQL invite lookup notice:", err?.message || err);
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ success: false, error: "Database unavailable" });
  }

  // 2. Try local store (non-production only; return only trip name and memberCount)
  const store = getLocalStore();
  const trip = store.trips.find((t: any) => {
    const codeVal = (t.inviteCode || t.invite_code || "").trim().toUpperCase();
    if (!codeVal) return false;
    return (
      codeVal === clean ||
      codeVal === `TRIP-${clean}` ||
      codeVal.replace("TRIP-", "").trim() === clean
    );
  });

  if (trip) {
    const expAt = trip.inviteExpiresAt || trip.invite_expires_at;
    if (expAt && new Date(expAt) < new Date()) {
      return res.status(410).json({
        success: false,
        error: "This invite code has expired. Please ask the trip organizer for a new one.",
      });
    }

    const memberCount = store.trip_members.filter((m: any) => m.trip_id === trip.id).length;
    return res.json({
      success: true,
      trip: {
        title: trip.title || trip.name || "Untitled Trip",
        name: trip.title || trip.name || "Untitled Trip",
        memberCount,
      },
    });
  }

  return res.status(404).json({
    success: false,
    error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
  });
});

// Atomic Join Trip by Invite Code
app.post("/api/trips/invite/join", async (req: AuthRequest, res) => {
  let { inviteCode, user } = req.body || {};
  let raw = String(inviteCode || "").trim();

  // Normalize code
  if (raw.includes("code=")) {
    const match = raw.match(/code=([^&?#]+)/);
    if (match && match[1]) raw = decodeURIComponent(match[1]);
  } else if (raw.startsWith("#join?")) {
    raw = raw.replace("#join?", "");
  }

  const clean = raw.trim().toUpperCase();
  const userId = user?.id || user?.userId;
  const userName = (user?.name || "Traveler").trim();
  const userEmail = (user?.email || "").trim().toLowerCase();
  const userPhone = (user?.phone || "").trim();
  const userAvatar = user?.avatarColor || "#0F6B65";

  if (!clean) {
    return res.status(400).json({ success: false, error: "Invite code is required." });
  }
  if (!userId) {
    return res.status(400).json({ success: false, error: "Please log in before joining a trip." });
  }

  // Verify Bearer token if provided, or require it in production / for registered users
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.startsWith("Bearer ")) {
    const authResult = await verifyAuthRequest(req);
    if (!authResult.authorized || !authResult.userId) {
      return res.status(401).json({ success: false, error: authResult.error || "Invalid or expired token" });
    }
    if (authResult.userId !== userId) {
      return res.status(403).json({ success: false, error: "Cannot join trip as another user" });
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(401).json({ success: false, error: "Authentication token required to join a trip." });
  } else if (pool) {
    try {
      // Prevent unauthenticated impersonation of registered accounts
      const registeredRes = await pool.query("SELECT id FROM public.users WHERE id = $1 LIMIT 1;", [userId]);
      if (registeredRes.rows.length > 0) {
        return res.status(401).json({
          success: false,
          error: "Authorization token required to join as a registered user.",
        });
      }
    } catch {}
  }

  if (pool) {
    try {
      const tripRes = await pool.query(
        `SELECT * FROM public.trips
         WHERE invite_code IS NOT NULL AND TRIM(invite_code) <> '' AND (
           UPPER(TRIM(invite_code)) = $1
           OR UPPER(TRIM(invite_code)) = 'TRIP-' || $1
           OR UPPER(TRIM(REPLACE(invite_code, 'TRIP-', ''))) = $1
         )
         LIMIT 1;`,
        [clean]
      );

      const trip = tripRes.rows[0];
      if (!trip && process.env.NODE_ENV === "production") {
        return res.status(404).json({
          success: false,
          error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
        });
      }

      if (trip) {
        if (trip.invite_expires_at && new Date(trip.invite_expires_at) < new Date()) {
          return res.status(410).json({
            success: false,
            error: "This invite code has expired. Please ask the trip organizer for a new one.",
          });
        }

        if (!authHeader.startsWith("Bearer ") && trip.owner_id === userId) {
          return res.status(401).json({
            success: false,
            error: "Authorization token required.",
          });
        }

        // Check if already a member
        const existingMemberRes = await pool.query(
          "SELECT * FROM public.trip_members WHERE trip_id = $1 AND (user_id = $2 OR id = $2) LIMIT 1;",
          [trip.id, userId]
        );

        let memberId = userId;
        let alreadyMember = false;

        if (existingMemberRes.rows.length > 0) {
          alreadyMember = true;
          memberId = existingMemberRes.rows[0].id;
        } else {
          // Check for invited placeholder member with matching email or phone
          let placeholderRes: any = { rows: [] };
          if (userEmail || userPhone) {
            placeholderRes = await pool.query(
              `SELECT * FROM public.trip_members
               WHERE trip_id = $1 AND (
                 ($2 <> '' AND LOWER(email) = $2)
                 OR ($3 <> '' AND phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($3, '\\D', '', 'g'), 10))
               ) LIMIT 1;`,
              [trip.id, userEmail, userPhone]
            );
          }

          if (placeholderRes.rows.length > 0) {
            const ph = placeholderRes.rows[0];
            memberId = ph.id;
            await pool.query(
              `UPDATE public.trip_members
               SET user_id = $1,
                   name = COALESCE(NULLIF(name, 'Traveler'), $2),
                   avatar_color = COALESCE(avatar_color, $3),
                   phone = COALESCE(phone, $4),
                   email = COALESCE(email, $5),
                   status = 'active'
               WHERE id = $6 AND trip_id = $7;`,
              [userId, userName, userAvatar, userPhone || null, userEmail || null, ph.id, trip.id]
            );
          } else {
            // Insert new member
            await pool.query(
              `INSERT INTO public.trip_members (
                id, trip_id, user_id, name, role, avatar_color, phone, email, joined_at, status
              ) VALUES ($1, $2, $3, $4, 'participant', $5, $6, $7, NOW(), 'active')
              ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                name = EXCLUDED.name,
                avatar_color = EXCLUDED.avatar_color,
                phone = COALESCE(EXCLUDED.phone, trip_members.phone),
                email = COALESCE(EXCLUDED.email, trip_members.email)
              WHERE public.trip_members.trip_id = EXCLUDED.trip_id;`,
              [memberId, trip.id, userId, userName, userAvatar, userPhone || null, userEmail || null]
            );
          }

          // Atomically update trips.member_user_ids array
          const currentIds: string[] = Array.isArray(trip.member_user_ids) ? trip.member_user_ids : [];
          const updatedIds = Array.from(new Set([...currentIds, userId, trip.owner_id].filter(Boolean)));
          await pool.query("UPDATE public.trips SET member_user_ids = $1, updated_at = NOW() WHERE id = $2;", [
            JSON.stringify(updatedIds),
            trip.id,
          ]);

          // Insert audit log
          await pool.query(
            `INSERT INTO public.activities (id, trip_id, ts, user_name, action, detail, actor_id, created_at)
             VALUES ($1, $2, 'Just now', $3, 'joined', $4, $5, NOW());`,
            [
              `act_${Date.now()}`,
              trip.id,
              userName,
              `${userName} joined the trip via invite code`,
              userId,
            ]
          );
        }

        // Fetch updated full trip
        const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
          pool.query("SELECT * FROM public.trip_members WHERE trip_id = $1 ORDER BY joined_at ASC;", [trip.id]),
          pool.query("SELECT * FROM public.expenses WHERE trip_id = $1 AND COALESCE(deleted, false) = false ORDER BY created_at DESC;", [trip.id]),
          pool.query("SELECT * FROM public.payments WHERE trip_id = $1 ORDER BY created_at DESC;", [trip.id]),
          pool.query("SELECT * FROM public.activities WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 50;", [trip.id]),
        ]);

        return res.json({
          success: true,
          alreadyMember,
          trip: {
            id: trip.id,
            title: trip.title,
            location: trip.location || trip.destination || "",
            destination: trip.destination || trip.location || "",
            startDate: trip.start_date,
            endDate: trip.end_date,
            currency: trip.currency || "INR",
            status: trip.status || "ACTIVE",
            ownerId: trip.owner_id,
            ownerName: trip.owner_name,
            inviteCode: trip.invite_code,
            inviteExpiresAt: trip.invite_expires_at,
            memberUserIds: Array.isArray(trip.member_user_ids) ? trip.member_user_ids : [],
            createdAt: trip.created_at,
            members: membersRes.rows,
            expenses: expensesRes.rows,
            payments: paymentsRes.rows,
            activities: activitiesRes.rows,
          },
        });
      }
    } catch (err: any) {
      console.warn("PostgreSQL join error:", err?.message || err);
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ success: false, error: "Database unavailable" });
  }

  // Local fallback (non-production only)
  const store = getLocalStore();
  const trip = store.trips.find((t: any) => {
    const codeVal = (t.inviteCode || t.invite_code || "").trim().toUpperCase();
    if (!codeVal) return false;
    return (
      codeVal === clean ||
      codeVal === `TRIP-${clean}` ||
      codeVal.replace("TRIP-", "").trim() === clean
    );
  });

  if (!trip) {
    return res.status(404).json({
      success: false,
      error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
    });
  }

  const isAlready = store.trip_members.some((m: any) => m.trip_id === trip.id && (m.user_id === userId || m.id === userId));
  if (!isAlready) {
    store.trip_members.push({
      id: userId,
      trip_id: trip.id,
      user_id: userId,
      name: userName,
      role: "participant",
      avatar_color: userAvatar,
      phone: userPhone,
      email: userEmail,
      joined_at: new Date().toISOString(),
      status: "active",
    });
    if (!trip.memberUserIds) trip.memberUserIds = [];
    if (!trip.memberUserIds.includes(userId)) trip.memberUserIds.push(userId);
    saveLocalStore(store);
  }

  const members = store.trip_members.filter((m: any) => m.trip_id === trip.id);
  const expenses = store.expenses.filter((e: any) => e.trip_id === trip.id);
  const payments = store.payments.filter((p: any) => p.trip_id === trip.id);
  const activities = store.activities.filter((a: any) => a.trip_id === trip.id);

  return res.json({
    success: true,
    alreadyMember: isAlready,
    trip: {
      ...trip,
      members,
      expenses,
      payments,
      activities,
    },
  });
});

app.post("/api/trips/link-members", authMiddleware, (req, res) => tripHandler(req, res));
app.post("/api/trips", authMiddleware, (req, res) => tripHandler(req, res));
app.put("/api/trips", authMiddleware, (req, res) => tripHandler(req, res));

app.all("/api/trips/:tripId/:resource/:itemId", authMiddleware, (req, res) => tripHandler(req, res));
app.all("/api/trips/:tripId/:resource", authMiddleware, (req, res) => tripHandler(req, res));

app.get("/api/trips/:tripId", authMiddleware, (req, res) => tripHandler(req, res));
app.post("/api/trips/:tripId", authMiddleware, (req, res) => tripHandler(req, res));
app.put("/api/trips/:tripId", authMiddleware, (req, res) => tripHandler(req, res));
app.delete("/api/trips/:tripId", authMiddleware, (req, res) => tripHandler(req, res));

app.post("/api/sync/mutation", authMiddleware, (req, res) => syncMutationHandler(req, res));

app.get("/api/download-audit-pdf", adminOnlyMiddleware, (_req, res) => {
  const filePath = path.resolve(__dirname, "public", "Spliito_Application_Review.pdf");
  res.download(filePath, "Spliito_Application_Review.pdf");
});

app.get("/api/cron/daily-check", cronOrAdminMiddleware, async (_req, res) => {
  try {
    const result = await runDiagnosticSweep("scheduled_2am");
    return res.json({ success: true, diagnostic: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post("/api/health/run-check", adminOnlyMiddleware, async (_req, res) => {
  try {
    const result = await runDiagnosticSweep("manual_trigger");
    return res.json({ success: true, diagnostic: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.get("/api/health/history", adminOnlyMiddleware, async (_req, res) => {
  try {
    await ensureDaily2AMCheckRan();
  } catch (catchupErr: any) {
    console.warn("Notice during 2 AM catchup check in history:", catchupErr?.message || catchupErr);
  }

  if (pool) {
    try {
      const result = await pool.query(`
        SELECT id, status, latency_ms, table_counts, auth_ok, rpc_ok, check_type, error_details, executed_at
        FROM public.health_checks
        ORDER BY executed_at DESC
        LIMIT 30;
      `);
      return res.json({ success: true, source: "postgres", history: result.rows });
    } catch (err: any) {
      console.warn("Notice querying health_checks in PostgreSQL:", err?.message || err);
    }
  }

  if (inMemoryHealthChecks.length > 0) {
    return res.json({
      success: true,
      source: "in_memory",
      history: inMemoryHealthChecks.slice(-30).reverse(),
    });
  }

  const filePath = path.resolve(__dirname, "data", "health_checks.json");
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return res.json({
        success: true,
        source: "local_store",
        history: Array.isArray(data) ? data.slice(-30).reverse() : [],
      });
    } catch {}
  }
  return res.json({ success: true, source: "empty", history: [] });
});

// Telegram Alerts & Webhook Endpoints (Admin Protected)
app.all("/api/telegram/settings", adminOnlyMiddleware, (req, res) => telegramSettingsHandler(req, res));
app.all("/api/telegram/test", adminOnlyMiddleware, (req, res) => telegramTestHandler(req, res));
app.all("/api/telegram/webhook", (req, res) => telegramWebhookHandler(req, res));
app.all("/api/telegram/detect-chat", adminOnlyMiddleware, (req, res) => telegramDetectChatHandler(req, res));

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
