import { Pool } from "pg";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const rawConn = (
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.POSTGRESQL_URL ||
  ""
).replace(/\?.*$/, "");

export function getDatabaseSslConfig(): boolean | { rejectUnauthorized: boolean } {
  const isLocalDB = rawConn.includes("localhost") || rawConn.includes("127.0.0.1");
  if (isLocalDB) return false;
  const isProd = process.env.NODE_ENV === "production";
  const allowInsecureSSL = !isProd && process.env.DB_SSL_ALLOW_INSECURE === "true";
  if (allowInsecureSSL) {
    return { rejectUnauthorized: false };
  }
  // Default to secure TLS verification
  return { rejectUnauthorized: true };
}

export const pool = rawConn
  ? new Pool({
      connectionString: rawConn,
      ssl: getDatabaseSslConfig(),
      max: 6,
      min: 1,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    })
  : null;

// Keep-alive warm ping to prevent cold disconnects and TCP/TLS renegotiation overhead
if (pool) {
  setInterval(async () => {
    try {
      await pool.query("SELECT 1;");
    } catch {}
  }, 25000);
}

// Session & Auth secret resolution with strict validation
export function getValidatedSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim() !== "") {
    return process.env.SESSION_SECRET.trim();
  }
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim() !== "") {
    return process.env.AUTH_SECRET.trim();
  }

  // In production cloud environments without explicit SESSION_SECRET,
  // securely derive high-entropy session secret from existing private infrastructure secrets
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim() !== "") {
    return crypto
      .createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY.trim())
      .update("tripsplit_auth_session_secret_seed")
      .digest("hex");
  }
  if (process.env.POSTGRES_URL && process.env.POSTGRES_URL.trim() !== "") {
    return crypto
      .createHmac("sha256", process.env.POSTGRES_URL.trim())
      .update("tripsplit_auth_session_secret_seed")
      .digest("hex");
  }

  // If in production and NO secret or infrastructure credentials exist at all:
  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL SECURITY ERROR: SESSION_SECRET or AUTH_SECRET environment variable is required in production.");
  }

  return "tripsplit_session_secret_dev";
}

export const getSessionSecret = getValidatedSessionSecret;
export const SESSION_SECRET = getValidatedSessionSecret();
export const PASSWORD_SALT =
  process.env.PASSWORD_SALT ||
  process.env.AUTH_SECRET ||
  (process.env.SUPABASE_SERVICE_ROLE_KEY
    ? crypto.createHash("sha256").update(process.env.SUPABASE_SERVICE_ROLE_KEY).digest("hex").slice(0, 32)
    : "");

export interface SessionPayload {
  userId: string;
  email?: string;
  name?: string;
  exp: number;
}

export function generateSessionToken(userId: string, email?: string, name?: string): string {
  const payload: SessionPayload = {
    userId,
    email,
    name,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  const headerBase64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(`${headerBase64}.${payloadBase64}`).digest("base64url");
  return `${headerBase64}.${payloadBase64}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");

  // 1. Standard 3-part JWT: header.payload.signature
  if (parts.length === 3) {
    const [headerBase64, payloadBase64, signatureBase64] = parts;
    const signature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(`${headerBase64}.${payloadBase64}`)
      .digest("base64url");
    if (signature !== signatureBase64) return null;
    try {
      const payload: SessionPayload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
      const nowSec = Math.floor(Date.now() / 1000);
      const expVal = payload.exp > 1e11 ? payload.exp / 1000 : payload.exp;
      if (expVal && expVal < nowSec) return null;
      return payload;
    } catch {
      return null;
    }
  }

  // 2. Legacy 2-part token: data.signature
  if (parts.length === 2) {
    const [data, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
    if (sig !== expectedSig) return null;
    try {
      const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
      if (payload.exp && Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }

  return null;
}

export function hashPasswordNode(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export interface PasswordVerificationResult {
  valid: boolean;
  needsRehash: boolean;
  method: "bcrypt" | "legacy_sha256" | "none";
}

export function verifyPasswordMatchNode(
  inputPassword: string,
  storedHashOrPassword?: string | null
): PasswordVerificationResult {
  if (!storedHashOrPassword || !inputPassword || storedHashOrPassword.trim() === "") {
    return { valid: false, needsRehash: false, method: "none" };
  }

  const trimmedStored = storedHashOrPassword.trim();

  // 1. Modern Bcrypt hash check ($2a$, $2b$, $2y$)
  if (
    trimmedStored.startsWith("$2a$") ||
    trimmedStored.startsWith("$2b$") ||
    trimmedStored.startsWith("$2y$")
  ) {
    try {
      const match = bcrypt.compareSync(inputPassword, trimmedStored);
      return { valid: match, needsRehash: false, method: match ? "bcrypt" : "none" };
    } catch {
      return { valid: false, needsRehash: false, method: "none" };
    }
  }

  // 2. Reject exact plaintext passwords in all environments
  // 3. Reject weak unsalted SHA-256 and simple hashes (e.g. fb_*)
  if (trimmedStored === inputPassword || trimmedStored.startsWith("fb_")) {
    return { valid: false, needsRehash: false, method: "none" };
  }

  // 4. Safe legacy migration path: Salted SHA-256 with custom env salt or legacy salt
  if (PASSWORD_SALT) {
    const envSalted = crypto.createHash("sha256").update(inputPassword + PASSWORD_SALT).digest("hex");
    if (trimmedStored === envSalted) {
      return { valid: true, needsRehash: true, method: "legacy_sha256" };
    }
  }

  const legacySalted = crypto.createHash("sha256").update(inputPassword + "_tripsplit_salt_v1").digest("hex");
  if (trimmedStored === legacySalted) {
    return { valid: true, needsRehash: true, method: "legacy_sha256" };
  }

  return { valid: false, needsRehash: false, method: "none" };
}

export function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    // Allow local development ports
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;

    // Explicit configured allowed origins
    const configuredAllowed = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (configuredAllowed.includes(origin.toLowerCase()) || configuredAllowed.includes(hostname)) {
      return true;
    }

    // Google Cloud Run application domains
    if (hostname.endsWith(".run.app")) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function setCorsHeaders(res: any, req?: any): boolean {
  const origin = typeof req === "string" ? req : req?.headers?.origin || "";
  const allowed = isOriginAllowed(origin);

  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else if (!origin) {
    // Direct or server-side call
  } else {
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token");
  return allowed;
}

// In-Memory Rate Limiter for Login/Signup Brute-Force Protection
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitBuckets = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 5 * 60 * 1000
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const record = rateLimitBuckets.get(key);

  if (!record || now >= record.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, retryAfterSec: 0 };
  }

  if (record.count >= maxAttempts) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  record.count += 1;
  return { allowed: true, remaining: maxAttempts - record.count, retryAfterSec: 0 };
}

export function resetRateLimit(key: string): void {
  rateLimitBuckets.delete(key);
}

export function getClientIp(req: any): string {
  return (
    req.headers?.["x-forwarded-for"]?.split(",")?.[0]?.trim() ||
    req.headers?.["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "127.0.0.1"
  );
}

export function parseBody(req: any): any {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export function sendJson(res: any, statusCode: number, data: any) {
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  if (typeof res.status === "function") {
    res.status(statusCode).json(data);
  } else {
    res.statusCode = statusCode;
    res.end(JSON.stringify(data));
  }
}

// In-memory fallback for serverless environments (Vercel/Cloudflare)
export interface LocalUserRecord {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  avatar_color: string;
  avatar_url?: string;
  bio?: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface LocalMemberRecord {
  id: string;
  trip_id: string;
  user_id?: string;
  name: string;
  email?: string;
  phone?: string;
  avatar_color?: string;
  role?: string;
  joined_at?: string;
}

export interface ServerStoreSchema {
  users: LocalUserRecord[];
  trips: any[];
  trip_members: LocalMemberRecord[];
  expenses: any[];
  payments: any[];
  activities: any[];
}

let inMemoryStore: ServerStoreSchema = {
  users: [],
  trips: [],
  trip_members: [],
  expenses: [],
  payments: [],
  activities: [],
};

function getStoragePath(): string | null {
  try {
    const candidate = path.resolve(process.cwd(), "data", "server_store.json");
    return candidate;
  } catch {
    return null;
  }
}

export function getLocalStore(): ServerStoreSchema {
  try {
    const filePath = getStoragePath();
    if (filePath && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const diskUsers = Array.isArray(parsed.users) ? parsed.users : inMemoryStore.users;
      const users = diskUsers.map((u: any) => {
        const memUser = inMemoryStore.users.find((mu) => mu.id === u.id);
        return {
          ...u,
          password_hash: memUser?.password_hash || "",
        };
      });
      return {
        users,
        trips: Array.isArray(parsed.trips) ? parsed.trips : inMemoryStore.trips,
        trip_members: Array.isArray(parsed.trip_members) ? parsed.trip_members : inMemoryStore.trip_members,
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : inMemoryStore.expenses,
        payments: Array.isArray(parsed.payments) ? parsed.payments : inMemoryStore.payments,
        activities: Array.isArray(parsed.activities) ? parsed.activities : inMemoryStore.activities,
      };
    }
  } catch {}
  return inMemoryStore;
}

export const loadLocalStore = getLocalStore;

export function saveLocalStore(data: ServerStoreSchema): void {
  inMemoryStore = data;
  try {
    const filePath = getStoragePath();
    if (filePath) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Security: Strip password_hash from JSON persistence so hashes are never stored on filesystem
      const sanitizedData = {
        ...data,
        users: (data.users || []).map(({ password_hash, ...u }) => ({
          ...u,
          password_hash: "",
        })),
      };
      fs.writeFileSync(filePath, JSON.stringify(sanitizedData, null, 2), "utf-8");
    }
  } catch {}
}

export function findLocalUser(identifier: string): LocalUserRecord | null {
  const store = getLocalStore();
  const trimmed = identifier.trim().toLowerCase();
  const cleanDigits = identifier.replace(/\D/g, "");

  let found = store.users.find(
    (u) =>
      (u.email && u.email.trim().toLowerCase() === trimmed) ||
      (u.name && u.name.trim().toLowerCase() === trimmed)
  );

  if (!found && cleanDigits.length >= 7) {
    found = store.users.find((u) => {
      const phoneDigits = (u.phone || "").replace(/\D/g, "");
      return phoneDigits.length >= 7 && (phoneDigits.endsWith(cleanDigits) || cleanDigits.endsWith(phoneDigits));
    });
  }

  return found || null;
}

export function findLocalMember(identifier: string): LocalMemberRecord | null {
  const store = getLocalStore();
  const trimmed = identifier.trim().toLowerCase();
  const cleanDigits = identifier.replace(/\D/g, "");

  let found = store.trip_members.find(
    (m) =>
      (m.email && m.email.trim().toLowerCase() === trimmed) ||
      (m.name && m.name.trim().toLowerCase() === trimmed)
  );

  if (!found && cleanDigits.length >= 7) {
    found = store.trip_members.find((m) => {
      const phoneDigits = (m.phone || "").replace(/\D/g, "");
      return phoneDigits.length >= 7 && (phoneDigits.endsWith(cleanDigits) || cleanDigits.endsWith(phoneDigits));
    });
  }

  return found || null;
}

export function saveLocalUser(user: LocalUserRecord): void {
  const store = getLocalStore();
  const idx = store.users.findIndex((u) => u.id === user.id);
  if (idx >= 0) store.users[idx] = user;
  else store.users.push(user);
  saveLocalStore(store);
}
