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

export const SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUta
UYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

export function getDatabaseSslConfig(): boolean | { rejectUnauthorized: boolean; ca?: string } {
  const isLocalDB = rawConn.includes("localhost") || rawConn.includes("127.0.0.1");
  if (isLocalDB) return false;
  const isProd = process.env.NODE_ENV === "production";
  const allowInsecureSSL = !isProd && process.env.DB_SSL_ALLOW_INSECURE === "true";
  if (allowInsecureSSL) {
    return { rejectUnauthorized: false };
  }
  // For Supabase databases, provide the official Supabase Root CA for strict verification
  const isSupabase = rawConn.includes("supabase.co") || rawConn.includes("supabase.com");
  if (isSupabase) {
    return {
      rejectUnauthorized: true,
      ca: process.env.SUPABASE_CA_CERT || SUPABASE_ROOT_CA,
    };
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
  const vercelFallbackSeed =
    process.env.VERCEL_PROJECT_ID ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";
  if (vercelFallbackSeed.trim() !== "") {
    return crypto
      .createHmac("sha256", vercelFallbackSeed.trim())
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

export const ADMIN_EMAILS = [
  "ayanroy525@gmail.com",
  (process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
].filter(Boolean);

export interface SessionPayload {
  userId: string;
  email?: string;
  name?: string;
  tokenVersion?: number;
  iat?: number;
  exp: number;
}

export function generateSessionToken(userId: string, email?: string, name?: string, tokenVersion: number = 1): string {
  const payload: SessionPayload = {
    userId,
    email,
    name,
    tokenVersion,
    iat: Math.floor(Date.now() / 1000),
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

  const candidateSecrets = [SESSION_SECRET];
  if (process.env.NODE_ENV !== "production") {
    candidateSecrets.push("tripsplit_session_secret_dev", "tripsplit_auth_token_secret_seed");
  }

  // 1. Standard 3-part JWT: header.payload.signature
  if (parts.length === 3) {
    const [headerBase64, payloadBase64, signatureBase64] = parts;
    const isValidSig = candidateSecrets.some((sec) => {
      if (!sec) return false;
      const expected = crypto
        .createHmac("sha256", sec)
        .update(`${headerBase64}.${payloadBase64}`)
        .digest("base64url");
      return expected === signatureBase64;
    });
    if (!isValidSig) return null;
    try {
      const payload: SessionPayload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
      if (!payload || typeof payload !== "object" || !payload.userId) return null;
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
    const isValidSig = candidateSecrets.some((sec) => {
      if (!sec) return false;
      const expected = crypto.createHmac("sha256", sec).update(data).digest("base64url");
      return expected === sig;
    });
    if (!isValidSig) return null;
    try {
      const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
      if (!payload || typeof payload !== "object" || !payload.userId) return null;
      if (payload.exp && Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }

  return null;
}

export async function verifyBearerTokenAsync(token: string): Promise<{
  session: SessionPayload | null;
  revoked?: boolean;
}> {
  if (!token || typeof token !== "string") {
    return { session: null };
  }

  // 1. Primary: Verify server-signed HMAC session token
  let session = verifySessionToken(token);

  // 2. Secondary: If token is a Supabase Auth JWT, verify it against Supabase Auth API
  if (!session && token.split(".").length === 3) {
    try {
      const payloadRaw = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      const iss = String(payloadRaw?.iss || "");
      const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
      const supabaseKey = (
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        ""
      ).trim();

      if (
        iss.includes(".supabase.co/auth/v1") &&
        supabaseUrl &&
        supabaseKey &&
        payloadRaw?.sub
      ) {
        const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const userData = await res.json();
          if (userData && userData.id) {
            session = {
              userId: userData.id,
              email: userData.email || payloadRaw.email || "",
              name: userData.user_metadata?.name || "",
              iat: payloadRaw.iat || Math.floor(Date.now() / 1000),
              exp: payloadRaw.exp || Math.floor(Date.now() / 1000) + 3600,
            };
          }
        }
      }
    } catch {}
  }

  if (!session) {
    return { session: null };
  }

  // 3. Check token_version revocation
  if (session.tokenVersion !== undefined) {
    if (pool) {
      try {
        const uRes = await pool.query("SELECT token_version FROM public.users WHERE id = $1 LIMIT 1;", [session.userId]);
        const currentVersion = uRes.rows[0]?.token_version ?? 1;
        if (session.tokenVersion < currentVersion) {
          return { session: null, revoked: true };
        }
      } catch {}
    } else {
      const localStore = getLocalStore();
      const localUser = localStore.users.find((u) => u.id === session!.userId);
      const currentVersion = (localUser as any)?.token_version ?? 1;
      if (session.tokenVersion < currentVersion) {
        return { session: null, revoked: true };
      }
    }
  }

  return { session };
}

export interface AuthVerificationResult {
  authorized: boolean;
  statusCode: number;
  error?: string;
  userId?: string;
  email?: string;
  session?: SessionPayload;
}

export async function verifyAuthRequest(req: any): Promise<AuthVerificationResult> {
  if (req?.userId && req?.session) {
    return {
      authorized: true,
      statusCode: 200,
      userId: req.userId,
      email: req.session.email,
      session: req.session,
    };
  }

  const authHeader = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return {
      authorized: false,
      statusCode: 401,
      error: "Authorization token required",
    };
  }

  const { session, revoked } = await verifyBearerTokenAsync(token);
  if (revoked) {
    return {
      authorized: false,
      statusCode: 401,
      error: "Session has been revoked. Please log in again.",
    };
  }
  if (!session || !session.userId) {
    return {
      authorized: false,
      statusCode: 401,
      error: "Invalid or expired token",
    };
  }

  req.userId = session.userId;
  req.session = session;

  return {
    authorized: true,
    statusCode: 200,
    userId: session.userId,
    email: session.email,
    session,
  };
}

export async function verifyAdminRequest(req: any): Promise<AuthVerificationResult> {
  const authResult = await verifyAuthRequest(req);
  if (!authResult.authorized || !authResult.userId) {
    return authResult;
  }

  let userEmail = (authResult.email || req?.session?.email || "").trim().toLowerCase();
  if (!userEmail && authResult.userId) {
    if (pool) {
      try {
        const uRes = await pool.query("SELECT email FROM public.users WHERE id = $1 LIMIT 1;", [authResult.userId]);
        userEmail = (uRes.rows[0]?.email || "").trim().toLowerCase();
      } catch {}
    }
    if (!userEmail) {
      const store = getLocalStore();
      const u = store.users.find((user) => user.id === authResult.userId);
      userEmail = (u?.email || "").trim().toLowerCase();
    }
  }

  const isOwner = ADMIN_EMAILS.some((adm) => adm && userEmail === adm);
  if (!isOwner) {
    return {
      authorized: false,
      statusCode: 403,
      error: "Access Denied: Database telemetry and system diagnostics are restricted to the application administrator.",
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    userId: authResult.userId,
    email: userEmail,
    session: authResult.session,
  };
}

export async function verifyCronOrAdminRequest(req: any): Promise<AuthVerificationResult> {
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  const authHeader = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const cronHeader = String(req?.headers?.["x-cron-secret"] || req?.headers?.["X-Cron-Secret"] || "").trim();

  if (cronSecret && (bearerToken === cronSecret || cronHeader === cronSecret)) {
    return {
      authorized: true,
      statusCode: 200,
      userId: "system_cron",
    };
  }

  return verifyAdminRequest(req);
}

export interface TripAuthCheck {
  isOwner: boolean;
  isMember: boolean;
  canAccess: boolean;
  role?: string;
}

export async function checkTripAuthorization(
  tripId: string,
  userId: string | undefined,
  poolInstance: Pool | null = pool
): Promise<TripAuthCheck> {
  if (!tripId || !userId) {
    return { isOwner: false, isMember: false, canAccess: false };
  }

  if (poolInstance) {
    try {
      const tripRes = await poolInstance.query(
        "SELECT owner_id, member_user_ids FROM public.trips WHERE id = $1 LIMIT 1;",
        [tripId]
      );
      const trip = tripRes.rows[0];
      if (trip) {
        const isOwner = trip.owner_id === userId;
        if (isOwner) {
          return { isOwner: true, isMember: true, canAccess: true, role: "owner" };
        }

        const memberRes = await poolInstance.query(
          `SELECT tm.role FROM public.trip_members tm
           LEFT JOIN public.users u ON u.id = $2
           WHERE tm.trip_id = $1 AND (
             tm.user_id = $2
             OR tm.id = $2
             OR (u.email IS NOT NULL AND u.email <> '' AND LOWER(TRIM(tm.email)) = LOWER(TRIM(u.email)))
             OR (u.phone IS NOT NULL AND LENGTH(regexp_replace(u.phone, '\\D', '', 'g')) >= 7
                 AND regexp_replace(COALESCE(tm.phone, ''), '\\D', '', 'g') LIKE '%' || regexp_replace(u.phone, '\\D', '', 'g') || '%')
           )
           LIMIT 1;`,
          [tripId, userId]
        );

        const member = memberRes.rows[0];
        if (member) {
          return { isOwner: false, isMember: true, canAccess: true, role: member.role || "member" };
        }

        if (Array.isArray(trip.member_user_ids) && trip.member_user_ids.includes(userId)) {
          return { isOwner: false, isMember: true, canAccess: true, role: "member" };
        }

        return { isOwner: false, isMember: false, canAccess: false };
      }
    } catch (err) {
      console.warn("Notice checking trip authorization in PostgreSQL:", err);
    }
  }

  // Local store fallback
  const store = getLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) {
    return { isOwner: false, isMember: false, canAccess: false };
  }
  const isOwner = trip.owner_id === userId || trip.ownerId === userId;
  if (isOwner) {
    return { isOwner: true, isMember: true, canAccess: true, role: "owner" };
  }
  const member = store.trip_members.find(
    (m) => m.trip_id === tripId && (m.user_id === userId || m.id === userId)
  );
  if (member) {
    return { isOwner: false, isMember: true, canAccess: true, role: member.role || "member" };
  }

  return { isOwner: false, isMember: false, canAccess: false };
}

export function sanitizeReceiptUrl(rawUrl: any): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {}
  return "";
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
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token, X-Cron-Secret"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
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

export function logSecurityEvent(event: string, details: Record<string, any>): void {
  const logRecord = {
    level: "INFO",
    type: "SECURITY_AUDIT",
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };
  console.log(JSON.stringify(logRecord));
}

export function sendJson(res: any, statusCode: number, data: any) {
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  if (!res.getHeader?.("x-request-id") && typeof res.setHeader === "function") {
    res.setHeader("X-Request-Id", `req_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`);
  }
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
  status?: string;
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

export function getLocalStore(): ServerStoreSchema {
  return inMemoryStore;
}

export const loadLocalStore = getLocalStore;

export function saveLocalStore(data: ServerStoreSchema): void {
  // Security: Keep fallback state strictly in-memory; never write user/auth records to disk
  inMemoryStore = {
    users: Array.isArray(data.users) ? data.users : [],
    trips: Array.isArray(data.trips) ? data.trips : [],
    trip_members: Array.isArray(data.trip_members) ? data.trip_members : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
    payments: Array.isArray(data.payments) ? data.payments : [],
    activities: Array.isArray(data.activities) ? data.activities : [],
  };
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

export function getFullTripsForUser(userId: string) {
  const store = getLocalStore();
  const userObj = store.users.find((u) => u.id === userId);
  const userEmail = userObj?.email?.trim().toLowerCase() || "";
  const userPhoneDigits = (userObj?.phone || "").replace(/\D/g, "");

  const memberTripIds = new Set(
    store.trip_members
      .filter((m) => {
        if (m.user_id === userId || m.id === userId) return true;
        if (userEmail && m.email && m.email.trim().toLowerCase() === userEmail) return true;
        if (userPhoneDigits.length >= 7 && m.phone) {
          const mDigits = m.phone.replace(/\D/g, "");
          if (mDigits.length >= 7 && (mDigits.endsWith(userPhoneDigits) || userPhoneDigits.endsWith(mDigits))) {
            return true;
          }
        }
        return false;
      })
      .map((m) => m.trip_id)
  );

  const matchingTrips = store.trips.filter((t) => {
    if (t.owner_id === userId) return true;
    if (Array.isArray(t.member_user_ids) && t.member_user_ids.includes(userId)) return true;
    if (memberTripIds.has(t.id)) return true;
    return false;
  });

  return matchingTrips.map((trip) => ({
    ...trip,
    members: store.trip_members.filter((m) => m.trip_id === trip.id),
    expenses: store.expenses.filter((e) => e.trip_id === trip.id && !e.deleted),
    payments: store.payments.filter((p) => p.trip_id === trip.id),
    activities: store.activities.filter((a) => a.trip_id === trip.id).slice(0, 50),
  }));
}

/**
 * Server-side Smart User-Member Linking:
 * Links any invited placeholder rows in public.trip_members matching the user's email or phone
 * to the authenticated userId and adds userId to public.trips.member_user_ids.
 */
export async function linkUserToTripMembersInDb(
  dbPool: any,
  userId: string,
  email?: string | null,
  phone?: string | null,
  name?: string | null
): Promise<{ linkedTripsCount: number; linkedMembersCount: number }> {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanDigits = (phone || "").replace(/\D/g, "");
  const phoneTail = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits.length >= 7 ? cleanDigits : "";

  if (!userId || (!cleanEmail && !phoneTail)) {
    return { linkedTripsCount: 0, linkedMembersCount: 0 };
  }

  const linkedTripIds = new Set<string>();
  let linkedMembersCount = 0;

  // 1. Update in-memory store
  const store = getLocalStore();
  for (const m of store.trip_members) {
    const emailMatch = cleanEmail && m.email && m.email.trim().toLowerCase() === cleanEmail;
    const mDigits = (m.phone || "").replace(/\D/g, "");
    const phoneMatch =
      phoneTail &&
      mDigits.length >= 7 &&
      (mDigits.endsWith(phoneTail) || phoneTail.endsWith(mDigits));

    if ((emailMatch || phoneMatch) && m.user_id !== userId) {
      m.user_id = userId;
      if ((!m.name || m.name === "Traveler" || m.name === "Member" || m.name === "Guest") && name) {
        m.name = name;
      }
      linkedTripIds.add(m.trip_id);
      linkedMembersCount++;
    }
  }
  for (const t of store.trips) {
    if (linkedTripIds.has(t.id)) {
      const current = Array.isArray(t.member_user_ids) ? t.member_user_ids : [];
      if (!current.includes(userId)) {
        t.member_user_ids = [...current, userId];
      }
    }
  }

  // 2. Update PostgreSQL if available
  if (dbPool) {
    try {
      const matchRes = await dbPool.query(
        `UPDATE public.trip_members
         SET user_id = $1,
             email = COALESCE(NULLIF(TRIM(email), ''), $2),
             phone = COALESCE(NULLIF(TRIM(phone), ''), $3),
             name = CASE
               WHEN name IS NULL OR TRIM(name) = '' OR name IN ('Member', 'Guest', 'Traveler')
               THEN COALESCE(NULLIF(TRIM($4), ''), name)
               ELSE name
             END
         WHERE (user_id IS NULL OR user_id <> $1)
           AND (
             ($2 <> '' AND LOWER(TRIM(COALESCE(email, ''))) = $2)
             OR ($5 <> '' AND LENGTH(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g')) >= 7
                 AND RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), LENGTH($5)) = $5)
           )
         RETURNING trip_id;`,
        [userId, cleanEmail, phone || null, name || null, phoneTail]
      );

      for (const row of matchRes.rows) {
        if (row.trip_id) {
          linkedTripIds.add(row.trip_id);
          linkedMembersCount++;
        }
      }

      if (linkedTripIds.size > 0) {
        const tripIdList = Array.from(linkedTripIds);
        await dbPool.query(
          `UPDATE public.trips
           SET member_user_ids = CASE
             WHEN COALESCE(member_user_ids, '[]'::jsonb) @> to_jsonb($1::text)
             THEN COALESCE(member_user_ids, '[]'::jsonb)
             ELSE COALESCE(member_user_ids, '[]'::jsonb) || to_jsonb($1::text)
           END,
           updated_at = NOW()
           WHERE id = ANY($2::text[]);`,
          [userId, tripIdList]
        );
      }
    } catch (err: any) {
      console.warn("Notice in linkUserToTripMembersInDb:", err?.message || err);
    }
  }

  return { linkedTripsCount: linkedTripIds.size, linkedMembersCount };
}

