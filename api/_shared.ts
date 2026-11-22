import "dotenv/config";
import { Pool } from "pg";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import * as Sentry from "@sentry/node";

const rawConn = (
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.new_POSTGRES_URL ||
  process.env.new_POSTGRES_URL_NON_POOLING ||
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
  const isSupabase = rawConn.includes("supabase.co") || rawConn.includes("supabase.com");
  if (isSupabase) {
    return {
      rejectUnauthorized: true,
      ca: process.env.SUPABASE_CA_CERT || SUPABASE_ROOT_CA,
    };
  }
  return { rejectUnauthorized: true };
}

export const pool = rawConn
  ? new Pool({
      connectionString: rawConn,
      ssl: getDatabaseSslConfig(),
      max: 6,
      min: 1,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    })
  : null;

if (pool) {
  setInterval(async () => {
    try {
      await pool.query("SELECT 1;");
    } catch {}
  }, 25000);
}

export function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getValidatedSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim() !== "") {
    return process.env.SESSION_SECRET.trim();
  }

  if (process.env.NODE_ENV === "production") {
    console.error("CRITICAL SECURITY ERROR: SESSION_SECRET environment variable is required in production.");
    throw new Error("CRITICAL SECURITY ERROR: SESSION_SECRET environment variable is required in production.");
  }

  return "tripsplit_session_secret_dev";
}

export const getSessionSecret = getValidatedSessionSecret;
export const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim() !== ""
    ? process.env.SESSION_SECRET.trim()
    : process.env.NODE_ENV === "production"
    ? ""
    : "tripsplit_session_secret_dev";

export function generateSecureInviteCode(): string {
  return `TRIP-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

export function getDefaultInviteExpiryIso(days = 7): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

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

export const SESSION_COOKIE_NAME = "tripsplit_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function parseCookies(req: any): Record<string, string> {
  const result: Record<string, string> = {};
  const rawCookie = req?.headers?.cookie || req?.headers?.Cookie;
  if (!rawCookie || typeof rawCookie !== "string") return result;

  for (const part of rawCookie.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function isNonProdIframePreviewRequest(req?: any): boolean {
  if (process.env.NODE_ENV === "production" || !req) return false;
  const hostHeader = String(
    req?.headers?.["x-forwarded-host"] || req?.headers?.host || ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();
  const originHeader = String(req?.headers?.origin || req?.headers?.Origin || "")
    .trim()
    .toLowerCase();
  const hostWithoutPort = hostHeader.split(":")[0];
  return (
    hostWithoutPort.endsWith(".run.app") ||
    originHeader.includes(".run.app")
  );
}

export function setSessionCookie(res: any, token: string, req?: any): void {
  if (!res || typeof res.setHeader !== "function") return;
  const sameSitePart = isNonProdIframePreviewRequest(req)
    ? "SameSite=None; Partitioned"
    : "SameSite=Lax";
  const cookieValue = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; ${sameSitePart}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
  res.setHeader("Set-Cookie", cookieValue);
}

export function clearSessionCookie(res: any, req?: any): void {
  if (!res || typeof res.setHeader !== "function") return;
  const sameSitePart = isNonProdIframePreviewRequest(req)
    ? "SameSite=None; Partitioned"
    : "SameSite=Lax";
  const cookieValue = `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; ${sameSitePart}; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  res.setHeader("Set-Cookie", cookieValue);
}

export interface SessionPayload {
  userId: string;
  email?: string;
  name?: string;
  tokenVersion?: number;
  iat?: number;
  exp: number;
}

export function generateSessionToken(userId: string, email?: string, name?: string, tokenVersion: number = 1): string {
  const secret = getValidatedSessionSecret();
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
  const sig = crypto.createHmac("sha256", secret).update(`${headerBase64}.${payloadBase64}`).digest("base64url");
  return `${headerBase64}.${payloadBase64}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");

  const activeSecret = getValidatedSessionSecret();
  const candidateSecrets = [activeSecret];
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
      return timingSafeCompare(expected, signatureBase64);
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
      return timingSafeCompare(expected, sig);
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
      const supabaseUrl = (
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.SUPABASE_URL ||
        process.env.new_SUPABASE_URL ||
        process.env.new_NEXT_PUBLIC_SUPABASE_URL ||
        ""
      ).trim();
      const supabaseKey = (
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.new_SUPABASE_ANON_KEY ||
        process.env.new_NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.new_SUPABASE_SERVICE_ROLE_KEY ||
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
    } else if (process.env.NODE_ENV !== "production") {
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

function isSameOriginRequest(req: any, origin: string): boolean {
  if (!req || !origin || origin === "null") return false;
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
      return false;
    }
    const rawHost = String(
      req?.headers?.["x-forwarded-host"] || req?.headers?.host || ""
    )
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (!rawHost) return false;
    return parsedOrigin.host.toLowerCase() === rawHost;
  } catch {
    return false;
  }
}

export function verifyCsrfRequest(req: any): { valid: boolean; error?: string } {
  const method = String(req?.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { valid: true };
  }

  // Check Origin header if present: allow same-origin requests or explicitly allowlisted origins
  const origin = String(req?.headers?.origin || req?.headers?.Origin || "").trim();
  if (origin && !isSameOriginRequest(req, origin) && !isOriginAllowed(origin)) {
    logSecurityEvent("CSRF_REJECTED", {
      reason: "DISALLOWED_ORIGIN",
      method,
      origin,
      ip: getClientIp(req),
    });
    return { valid: false, error: "CSRF validation failed: untrusted origin" };
  }

  // Require custom header X-Requested-With on state-changing requests
  const requestedWith = String(
    req?.headers?.["x-requested-with"] || req?.headers?.["X-Requested-With"] || ""
  ).trim();
  if (!requestedWith) {
    logSecurityEvent("CSRF_REJECTED", {
      reason: "MISSING_CUSTOM_HEADER",
      method,
      origin: origin || null,
      ip: getClientIp(req),
    });
    return { valid: false, error: "CSRF validation failed: missing X-Requested-With header" };
  }

  return { valid: true };
}

export interface AuthVerificationResult {
  authorized: boolean;
  statusCode: number;
  error?: string;
  userId?: string;
  email?: string;
  session?: SessionPayload;
  authSource?: "cookie" | "bearer";
}

export async function verifyAuthRequest(req: any): Promise<AuthVerificationResult> {
  if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim())) {
    console.error("CRITICAL SECURITY ERROR: SESSION_SECRET environment variable is required in production.");
    return {
      authorized: false,
      statusCode: 500,
      error: "Server configuration error: SESSION_SECRET is missing.",
    };
  }

  // 1. Read HttpOnly cookie first
  const cookies = parseCookies(req);
  const cookieToken = (cookies[SESSION_COOKIE_NAME] || "").trim();

  // 2. Fall back to Authorization header only for existing sessions during migration
  const authHeader = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  const token = cookieToken || bearerToken;
  const authSource: "cookie" | "bearer" = cookieToken ? "cookie" : "bearer";

  if (!token && !(req?.userId && req?.session)) {
    return {
      authorized: false,
      statusCode: 401,
      error: "Authorization token required",
    };
  }

  // 3. Enforce CSRF protection on all state-changing authenticated requests
  const csrf = verifyCsrfRequest(req);
  if (!csrf.valid) {
    return {
      authorized: false,
      statusCode: 403,
      error: csrf.error || "CSRF validation failed",
    };
  }

  if (req?.userId && req?.session) {
    return {
      authorized: true,
      statusCode: 200,
      userId: req.userId,
      email: req.session.email,
      session: req.session,
    };
  }

  let session: SessionPayload | null = null;
  let revoked: boolean | undefined;
  try {
    const verified = await verifyBearerTokenAsync(token);
    session = verified.session;
    revoked = verified.revoked;
  } catch (err: any) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRITICAL SECURITY ERROR during token verification:", err?.message || err);
      return {
        authorized: false,
        statusCode: 500,
        error: "Server configuration error: SESSION_SECRET is missing.",
      };
    }
  }

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
    authSource,
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
    if (!userEmail && process.env.NODE_ENV !== "production") {
      const store = getLocalStore();
      const u = store.users.find((user) => user.id === authResult.userId);
      userEmail = (u?.email || "").trim().toLowerCase();
    }
  }

  const isOwner = ADMIN_EMAILS.some((adm) => adm && userEmail === adm);
  if (!isOwner) {
    logSecurityEvent("PERMISSION_DENIED", {
      scope: "ADMIN_ROUTE",
      userId: authResult.userId,
      ip: getClientIp(req),
    });
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

  // If the caller explicitly presented x-cron-secret, fail closed if CRON_SECRET is missing or mismatched
  if (cronHeader) {
    if (!cronSecret) {
      logSecurityEvent("PERMISSION_DENIED", {
        scope: "CRON_SECRET_MISSING",
        ip: getClientIp(req),
      });
      return {
        authorized: false,
        statusCode: 503,
        error: "Cron secret is not configured",
      };
    }
    if (timingSafeCompare(cronHeader, cronSecret)) {
      return {
        authorized: true,
        statusCode: 200,
        userId: "system_cron",
      };
    }
    logSecurityEvent("PERMISSION_DENIED", {
      scope: "CRON_SECRET_MISMATCH",
      ip: getClientIp(req),
    });
    return {
      authorized: false,
      statusCode: 401,
      error: "Invalid cron secret",
    };
  }

  // Constant-time check for Bearer <CRON_SECRET>
  if (cronSecret && bearerToken && timingSafeCompare(bearerToken, cronSecret)) {
    return {
      authorized: true,
      statusCode: 200,
      userId: "system_cron",
    };
  }

  // Fall back to authenticated admin user session check (fails closed if neither valid cron secret nor admin session)
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
    } catch {
      if (process.env.NODE_ENV === "production") {
        return { isOwner: false, isMember: false, canAccess: false };
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return { isOwner: false, isMember: false, canAccess: false };
  }

  // Local store fallback (non-production only)
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

// Top common passwords blocklist (case-insensitive)
export const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "87654321",
  "qwertyui",
  "qwerty123",
  "qwertyuiop",
  "1q2w3e4r",
  "abcd1234",
  "abc12345",
  "admin123",
  "administrator",
  "letmein1",
  "letmein123",
  "welcome1",
  "welcome123",
  "iloveyou",
  "iloveyou1",
  "monkey123",
  "dragon123",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "trustno1",
  "superman",
  "11111111",
  "00000000",
  "88888888",
  "99999999",
  "tripsplit",
  "tripsplit1",
  "changeme",
  "master12",
  "shadow12",
  "ashley12",
  "michael1",
  "charlie1",
  "donald12",
  "whatever",
  "starwars",
  "computer",
  "security",
  "zaq12wsx",
  "asdfghjk",
  "asdf1234",
  "zxcvbnm1",
]);

export function validatePasswordStrength(password: unknown): { valid: boolean; error?: string } {
  if (typeof password !== "string") {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }
  if (password.length > 128) {
    return { valid: false, error: "Password cannot exceed 128 characters." };
  }
  const lower = password.toLowerCase();
  const trimmedLower = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(trimmedLower)) {
    return {
      valid: false,
      error: "This password is too common. Please choose a stronger password.",
    };
  }
  if (/^(.)\1{7,}$/.test(password)) {
    return {
      valid: false,
      error: "This password is too common. Please choose a stronger password.",
    };
  }
  return { valid: true };
}

export const BCRYPT_COST = 12;

export function hashPasswordNode(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_COST);
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
      const rounds = bcrypt.getRounds(trimmedStored);
      return {
        valid: match,
        needsRehash: match && rounds < BCRYPT_COST,
        method: match ? "bcrypt" : "none",
      };
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
    const normalizedOrigin = parsed.origin.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    // 1. Allow localhost origins only when NODE_ENV is not "production"
    if (process.env.NODE_ENV !== "production" && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return true;
    }

    // 2. Allow APP_URL, VERCEL_URL, and VERCEL_PROJECT_PRODUCTION_URL env vars (exact origin match only)
    const envOriginCandidates = [
      process.env.APP_URL,
      process.env.VERCEL_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .map((s) => (s || "").trim())
      .filter(Boolean);

    for (const candidateRaw of envOriginCandidates) {
      try {
        const candidateParsed = new URL(
          candidateRaw.startsWith("http") ? candidateRaw : `https://${candidateRaw}`
        );
        if (normalizedOrigin === candidateParsed.origin.toLowerCase()) {
          return true;
        }
      } catch {
        if (normalizedOrigin === candidateRaw.replace(/\/$/, "").toLowerCase()) {
          return true;
        }
      }
    }

    // 3. Allow origins listed in ALLOWED_ORIGINS env var (comma-separated)
    const configuredAllowed = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const entry of configuredAllowed) {
      try {
        const entryParsed = new URL(entry.startsWith("http") ? entry : `https://${entry}`);
        if (normalizedOrigin === entryParsed.origin.toLowerCase()) {
          return true;
        }
      } catch {
        if (normalizedOrigin === entry.replace(/\/$/, "").toLowerCase()) {
          return true;
        }
      }
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
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return allowed;
}

// Postgres-Backed Rate Limiter (public.rate_limits)
export const RATE_LIMIT_UPSERT_SQL = `
  INSERT INTO public.rate_limits (key, count, reset_at)
  VALUES ($1, 1, NOW() + ($2::bigint * interval '1 millisecond'))
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN public.rate_limits.reset_at <= NOW() THEN 1
      ELSE public.rate_limits.count + 1
    END,
    reset_at = CASE
      WHEN public.rate_limits.reset_at <= NOW() THEN NOW() + ($2::bigint * interval '1 millisecond')
      ELSE public.rate_limits.reset_at
    END
  RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - NOW()))))::int AS retry_after_sec;
`;

export interface RateLimitDbExecutor {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const fallbackRateLimitTable = new Map<string, RateLimitRecord>();

let customRateLimitPool: RateLimitDbExecutor | null = null;
let rateLimitsTableInitialized = false;

export function setRateLimitPoolForTesting(executor: RateLimitDbExecutor | null): void {
  customRateLimitPool = executor;
}

async function ensureRateLimitsTable(db: RateLimitDbExecutor, force = false): Promise<void> {
  if ((rateLimitsTableInitialized && !force) || customRateLimitPool) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.rate_limits (
        key text PRIMARY KEY,
        count int NOT NULL DEFAULT 1,
        reset_at timestamptz NOT NULL
      );
    `);
    try {
      await db.query("ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;");
    } catch {}
    try {
      await db.query("REVOKE ALL ON TABLE public.rate_limits FROM anon, authenticated;");
    } catch {}
    rateLimitsTableInitialized = true;
  } catch {}
}

export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 5 * 60 * 1000,
  dbExecutor: RateLimitDbExecutor | null = customRateLimitPool || pool
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  if (dbExecutor) {
    try {
      await ensureRateLimitsTable(dbExecutor);
      let res: { rows: any[] };
      try {
        res = await dbExecutor.query(RATE_LIMIT_UPSERT_SQL, [key, windowMs]);
      } catch (queryErr: any) {
        if (queryErr?.code === "42P01") {
          // Table did not exist yet — create and retry once
          await ensureRateLimitsTable(dbExecutor, true);
          res = await dbExecutor.query(RATE_LIMIT_UPSERT_SQL, [key, windowMs]);
        } else {
          throw queryErr;
        }
      }
      const row = res.rows[0];
      const count = Number(row?.count ?? 1);
      const retryAfterSec = Math.max(1, Number(row?.retry_after_sec ?? Math.ceil(windowMs / 1000)));
      if (count > maxAttempts) {
        return { allowed: false, remaining: 0, retryAfterSec };
      }
      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - count),
        retryAfterSec: 0,
      };
    } catch (err: any) {
      if (process.env.NODE_ENV === "production") {
        console.error("[RateLimit] Postgres check failed:", err?.code || "UNKNOWN");
        // Fail closed on rate-limit DB error in production
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)),
        };
      }
    }
  }

  // Fallback simulation of public.rate_limits when running locally without a Postgres pool
  const now = Date.now();
  const record = fallbackRateLimitTable.get(key);

  if (!record || now >= record.resetAt) {
    fallbackRateLimitTable.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, maxAttempts - 1), retryAfterSec: 0 };
  }

  record.count += 1;
  if (record.count > maxAttempts) {
    const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return { allowed: true, remaining: Math.max(0, maxAttempts - record.count), retryAfterSec: 0 };
}

export async function resetRateLimit(
  key: string,
  dbExecutor: RateLimitDbExecutor | null = customRateLimitPool || pool
): Promise<void> {
  fallbackRateLimitTable.delete(key);
  if (dbExecutor) {
    try {
      await dbExecutor.query("DELETE FROM public.rate_limits WHERE key = $1;", [key]);
    } catch {}
  }
}

export function sendRateLimitExceeded(
  res: any,
  retryAfterSec: number,
  message = "Too many attempts. Please try again later."
): void {
  const safeRetry = Math.max(1, Math.ceil(retryAfterSec || 60));
  if (res && typeof res.setHeader === "function") {
    res.setHeader("Retry-After", String(safeRetry));
  }
  sendJson(res, 429, {
    error: message,
    retryAfterSec: safeRetry,
  });
}

export function getClientIp(req: any): string {
  // 1. On Vercel, use x-vercel-forwarded-for (populated by Vercel edge proxy)
  const vercelForwarded = req?.headers?.["x-vercel-forwarded-for"];
  if (typeof vercelForwarded === "string" && vercelForwarded.trim()) {
    const hops = vercelForwarded
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }

  // 2. Otherwise use the LAST hop of x-forwarded-for (appended by the trusted reverse proxy), never the client-controlled first hop
  const xff = req?.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const hops = xff
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }

  return (
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress ||
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

// Structured security audit logger (strips any sensitive keys if accidentally passed)
const SENSITIVE_LOG_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "password_hash",
  "passwordhash",
  "token",
  "bottoken",
  "telegram_bot_token",
  "secret",
  "authorization",
  "cookie",
]);

export function logSecurityEvent(event: string, details: Record<string, any>): void {
  const safeDetails: Record<string, any> = {};
  for (const [k, v] of Object.entries(details || {})) {
    if (SENSITIVE_LOG_KEYS.has(k.toLowerCase())) continue;
    safeDetails[k] = v;
  }
  const logRecord = {
    level: "INFO",
    type: "SECURITY_AUDIT",
    event,
    timestamp: new Date().toISOString(),
    ...safeDetails,
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

// ============================================================================
// Zod Input Validation Schemas (Requirement 5)
// ============================================================================

export const SAFE_ID_REGEX = /^[A-Za-z0-9_:-]{1,64}$/;
export const INVITE_CODE_REGEX = /^[A-Za-z0-9_-]{4,32}$/;

export const safeIdSchema = z
  .string()
  .trim()
  .min(1, "ID is required")
  .max(64, "ID cannot exceed 64 characters")
  .regex(SAFE_ID_REGEX, "Invalid ID format");

export const optionalSafeIdSchema = z
  .string()
  .trim()
  .max(64, "ID cannot exceed 64 characters")
  .regex(SAFE_ID_REGEX, "Invalid ID format")
  .optional()
  .nullable();

export const inviteCodeSchema = z
  .string()
  .trim()
  .min(4, "Invite code is too short")
  .max(32, "Invite code cannot exceed 32 characters")
  .regex(INVITE_CODE_REGEX, "Invalid invite code format");

export const amountSchema = z
  .number({ message: "Amount must be a valid number" })
  .finite("Amount must be a finite number")
  .min(0, "Amount cannot be negative")
  .max(100_000_000, "Amount exceeds maximum allowed limit");

export const memberRoleSchema = z.enum(["owner", "admin", "member", "editor", "viewer"]);
export const memberStatusSchema = z.enum(["accepted", "pending", "invited", "active", "removed"]);
export const splitMethodSchema = z.enum([
  "equal",
  "exact",
  "percentage",
  "shares",
  "custom",
  "itemized",
  "adjustment",
]);
export const currencySchema = z.enum([
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "JPY",
  "SGD",
  "THB",
  "AUD",
  "CAD",
  "CHF",
  "MYR",
  "IDR",
  "VND",
  "LKR",
  "NPR",
]);

export const loginBodySchema = z.object({
  identifier: z.string().trim().max(160).optional(),
  email: z.string().trim().max(160).optional(),
  password: z.string().min(1, "Password is required").max(128, "Password exceeds maximum length"),
}).refine((data) => Boolean((data.identifier || data.email || "").trim()), {
  message: "Identifier or email is required",
});

export const signupBodySchema = z.object({
  email: z.string().trim().email("Invalid email format").max(160).optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  phone: z.string().trim().max(30, "Phone number is too long").optional().nullable(),
  password: z.string().min(8, "Password must be at least 8 characters long.").max(128, "Password cannot exceed 128 characters."),
  avatarColor: z.string().trim().max(64).optional(),
  avatarUrl: z.string().trim().max(500_000).optional(),
  bio: z.string().trim().max(500, "Bio cannot exceed 500 characters").optional(),
});

export const updatePasswordBodySchema = z.object({
  userId: safeIdSchema.optional(),
  email: z.string().trim().max(160).optional(),
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters long.").max(128, "Password cannot exceed 128 characters."),
});

export const inviteLookupQuerySchema = z.object({
  code: inviteCodeSchema,
});

export const inviteJoinBodySchema = z.object({
  code: inviteCodeSchema,
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().email("Invalid email").max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().nullable(),
  avatarColor: z.string().trim().max(64).optional(),
});

export const memberBodySchema = z.object({
  id: safeIdSchema.optional(),
  trip_id: safeIdSchema.optional(),
  tripId: safeIdSchema.optional(),
  user_id: optionalSafeIdSchema,
  userId: optionalSafeIdSchema,
  name: z.string().trim().min(1, "Member name is required").max(100, "Member name is too long"),
  email: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  avatar_color: z.string().trim().max(64).optional().nullable(),
  avatarColor: z.string().trim().max(64).optional().nullable(),
  avatar_url: z.string().trim().max(500_000).optional().nullable(),
  avatarUrl: z.string().trim().max(500_000).optional().nullable(),
  role: memberRoleSchema.optional(),
  status: memberStatusSchema.optional(),
  joined_at: z.string().trim().max(64).optional().nullable(),
  joinedAt: z.string().trim().max(64).optional().nullable(),
});

export const expenseBodySchema = z.object({
  id: safeIdSchema.optional(),
  trip_id: safeIdSchema.optional(),
  tripId: safeIdSchema.optional(),
  title: z.string().trim().min(1, "Expense title is required").max(160, "Expense title is too long"),
  amount: amountSchema,
  category: z.string().trim().max(64).optional(),
  paid_by: safeIdSchema.optional(),
  paidBy: safeIdSchema.optional(),
  date: z.string().trim().max(64).optional(),
  method: splitMethodSchema.optional(),
  split_type: splitMethodSchema.optional(),
  splitType: splitMethodSchema.optional(),
  splits: z.record(z.string().regex(SAFE_ID_REGEX), amountSchema).optional(),
  split_With: z.record(z.string(), z.any()).optional(),
  splitDetails: z.record(z.string(), z.any()).optional(),
  split_details: z.record(z.string(), z.any()).optional(),
  notes: z.string().trim().max(1000, "Notes cannot exceed 1000 characters").optional().nullable(),
  receipt_url: z.string().max(2_000_000).optional().nullable(),
  receiptUrl: z.string().max(2_000_000).optional().nullable(),
  deleted: z.boolean().optional(),
  created_at: z.string().trim().max(64).optional().nullable(),
  createdAt: z.string().trim().max(64).optional().nullable(),
});

export const paymentBodySchema = z.object({
  id: safeIdSchema.optional(),
  trip_id: safeIdSchema.optional(),
  tripId: safeIdSchema.optional(),
  from_member: safeIdSchema.optional(),
  fromMember: safeIdSchema.optional(),
  from: safeIdSchema.optional(),
  to_member: safeIdSchema.optional(),
  toMember: safeIdSchema.optional(),
  to: safeIdSchema.optional(),
  amount: amountSchema,
  date: z.string().trim().max(64).optional(),
  method: z.string().trim().max(64).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  created_at: z.string().trim().max(64).optional().nullable(),
  createdAt: z.string().trim().max(64).optional().nullable(),
});

export const activityBodySchema = z.object({
  id: safeIdSchema.optional(),
  trip_id: safeIdSchema.optional(),
  tripId: safeIdSchema.optional(),
  type: z.string().trim().max(64).optional(),
  action: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  details: z.string().trim().max(1000).optional().nullable(),
  actor_id: optionalSafeIdSchema,
  actorId: optionalSafeIdSchema,
  actor_name: z.string().trim().max(100).optional().nullable(),
  actorName: z.string().trim().max(100).optional().nullable(),
  user_name: z.string().trim().max(100).optional().nullable(),
  userName: z.string().trim().max(100).optional().nullable(),
  amount: amountSchema.optional().nullable(),
  category: z.string().trim().max(64).optional().nullable(),
  timestamp: z.string().trim().max(64).optional(),
  created_at: z.string().trim().max(64).optional(),
});

export const tripUpsertBodySchema = z.object({
  id: safeIdSchema.optional(),
  title: z.string().trim().max(160, "Trip title cannot exceed 160 characters").optional(),
  name: z.string().trim().max(160, "Trip name cannot exceed 160 characters").optional(),
  location: z.string().trim().max(160).optional().nullable(),
  destination: z.string().trim().max(160).optional().nullable(),
  startDate: z.string().trim().max(64).optional().nullable(),
  start_date: z.string().trim().max(64).optional().nullable(),
  endDate: z.string().trim().max(64).optional().nullable(),
  end_date: z.string().trim().max(64).optional().nullable(),
  currency: currencySchema.optional(),
  budget: amountSchema.optional().nullable(),
  coverImage: z.string().max(1_000_000).optional().nullable(),
  cover_image: z.string().max(1_000_000).optional().nullable(),
  owner_id: optionalSafeIdSchema,
  ownerId: optionalSafeIdSchema,
  invite_code: inviteCodeSchema.optional().nullable(),
  inviteCode: inviteCodeSchema.optional().nullable(),
  invite_expires_at: z.string().trim().max(64).optional().nullable(),
  inviteExpiresAt: z.string().trim().max(64).optional().nullable(),
  member_user_ids: z.array(safeIdSchema).max(200).optional(),
  members: z.array(memberBodySchema).max(200).optional(),
  expenses: z.array(expenseBodySchema).max(2000).optional(),
  payments: z.array(paymentBodySchema).max(2000).optional(),
  activities: z.array(activityBodySchema).max(2000).optional(),
  trip: z.any().optional(),
});

export const mutationActionSchema = z.enum([
  "UPSERT_TRIP",
  "DELETE_TRIP",
  "SAVE_EXPENSE_ATOMIC",
  "DELETE_EXPENSE_ATOMIC",
  "UPSERT_EXPENSE",
  "DELETE_EXPENSE",
  "UPSERT_PAYMENT",
  "DELETE_PAYMENT",
  "UPSERT_MEMBER",
  "DELETE_MEMBER",
  "UPSERT_ACTIVITY",
  "DELETE_ACTIVITY",
  "LINK_USER_TO_MEMBERS",
]);

export const syncMutationBodySchema = z.object({
  action: mutationActionSchema,
  payload: z.record(z.string(), z.any()),
});

export const telegramSettingsBodySchema = z.object({
  webhookUrl: z.string().trim().url("Invalid webhook URL").max(512).optional().or(z.literal("")),
  dailyReportEnabled: z.boolean().optional(),
  registerWebhook: z.boolean().optional(),
});

export const telegramTestBodySchema = z.object({
  type: z.enum(["test", "report"]).optional(),
});

export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: boolean; data?: T; error?: string } {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  const firstIssue = parsed.error.issues?.[0];
  const safeMessage = firstIssue?.message || "Invalid request parameters";
  return { success: false, error: safeMessage };
}

// In-memory fallback for non-production environments
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
  trips: [
    {
      id: "trip_goa_mucteofh",
      title: "Goa",
      name: "Goa",
      destination: "Goa",
      currency: "INR",
      owner_id: "u_goa_owner",
      ownerId: "u_goa_owner",
      invite_code: "TRIP-F25K4S",
      inviteCode: "TRIP-F25K4S",
      invite_expires_at: getDefaultInviteExpiryIso(),
      inviteExpiresAt: getDefaultInviteExpiryIso(),
      created_at: new Date().toISOString(),
    },
  ],
  trip_members: [
    {
      id: "m_goa_1",
      trip_id: "trip_goa_mucteofh",
      user_id: "u_goa_owner",
      name: "Organizer",
      role: "admin",
      status: "accepted",
      joined_at: new Date().toISOString(),
    },
  ],
  expenses: [],
  payments: [],
  activities: [],
};

export function getLocalStore(): ServerStoreSchema {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local JSON/in-memory store fallback is disabled in production.");
  }
  return inMemoryStore;
}

export const loadLocalStore = getLocalStore;

export function saveLocalStore(data: ServerStoreSchema): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local JSON/in-memory store fallback is disabled in production.");
  }
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

  if (process.env.NODE_ENV !== "production") {
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
  }

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
    } catch {}
  }

  return { linkedTripsCount: linkedTripIds.size, linkedMembersCount };
}

// ============================================================================
// Server-Side Sentry Error Monitoring & PII/DB Scrubbing
// ============================================================================

const SERVER_SENSITIVE_KEY_PATTERN =
  /pass(word|wd)?|pwd|secret|token|auth(orization)?|cookie|jwt|session|phone|mobile|tel|email|mail|body|payload|credential|api[-_]?key/i;

const SERVER_DB_ERROR_PATTERN =
  /duplicate key value|violates\s+(?:unique|foreign key|not-null|check)\s+constraint|permission denied for (?:table|relation|schema|function)|relation\s+"[^"]+"\s+does not exist|column\s+"[^"]+"\s+does not exist|syntax error at or near|postgres(?:ql)?:\/\/|SQLSTATE|invalid input syntax for type/i;

const SERVER_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SERVER_BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const SERVER_JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const SERVER_PHONE_PATTERN = /(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}(?!\w)/g;
const SERVER_KV_SECRET_PATTERN =
  /\b(password|passwd|pwd|token|secret|authorization|cookie)\s*[:=]\s*[^\s,&;"']+/gi;

let serverSentryInitialized = false;

export function initServerSentry(): boolean {
  if (serverSentryInitialized) return true;
  const dsn = (process.env.SENTRY_DSN || "").trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    release: (process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "").trim() || undefined,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      return scrubServerSentryEvent(event);
    },
  });

  serverSentryInitialized = true;
  return true;
}

function scrubServerString(value: string): string {
  if (SERVER_DB_ERROR_PATTERN.test(value)) {
    return "[REDACTED_DB_ERROR]";
  }
  return value
    .replace(SERVER_BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(SERVER_JWT_PATTERN, "[REDACTED_JWT]")
    .replace(SERVER_EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(SERVER_KV_SECRET_PATTERN, "$1=[REDACTED]")
    .replace(SERVER_PHONE_PATTERN, (match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15 ? "[REDACTED_PHONE]" : match;
    });
}

function scrubServerUnknown(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === "string") return scrubServerString(value);
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrubServerUnknown(item, depth + 1));
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SERVER_SENSITIVE_KEY_PATTERN.test(key)) {
      scrubbed[key] = "[REDACTED]";
    } else {
      scrubbed[key] = scrubServerUnknown(val, depth + 1);
    }
  }
  return scrubbed;
}

export function scrubServerSentryEvent<T extends Record<string, any>>(event: T): T {
  if (!event || typeof event !== "object") return event;
  const evt: Record<string, any> = event;

  if (evt.user) {
    evt.user = evt.user.id ? { id: String(evt.user.id) } : undefined;
  }

  if (evt.request) {
    delete evt.request.data;
    delete evt.request.headers;
    delete evt.request.cookies;
    delete evt.request.query_string;
    if (typeof evt.request.url === "string") {
      evt.request.url = scrubServerString(evt.request.url.split("?")[0]);
    }
  }

  if (typeof evt.message === "string") {
    evt.message = scrubServerString(evt.message);
  }

  if (evt.exception?.values && Array.isArray(evt.exception.values)) {
    evt.exception.values = evt.exception.values.map((ex: any) => ({
      ...ex,
      value: typeof ex?.value === "string" ? scrubServerString(ex.value) : ex?.value,
    }));
  }

  if (Array.isArray(evt.breadcrumbs)) {
    evt.breadcrumbs = evt.breadcrumbs.map((crumb: any) => ({
      ...crumb,
      message: typeof crumb?.message === "string" ? scrubServerString(crumb.message) : crumb?.message,
      data: crumb?.data ? scrubServerUnknown(crumb.data) : undefined,
    }));
  }

  if (evt.extra) {
    evt.extra = scrubServerUnknown(evt.extra);
  }

  if (evt.contexts) {
    evt.contexts = scrubServerUnknown(evt.contexts);
  }

  return evt as T;
}

function isDatabaseError(err: any): boolean {
  if (!err || typeof err !== "object") return false;
  if (err.severity && typeof err.severity === "string") return true;
  if (typeof err.code === "string" && /^[0-9A-Z]{5}$/.test(err.code)) return true;
  if (typeof err.message === "string" && SERVER_DB_ERROR_PATTERN.test(err.message)) return true;
  return false;
}

export function withSentry<T extends (req: any, res: any) => Promise<any> | any>(handler: T) {
  return async function sentryWrappedHandler(req: any, res: any) {
    initServerSentry();
    const safeUrl = typeof req?.url === "string" ? req.url.split("?")[0] : "unknown";
    const method = typeof req?.method === "string" ? req.method : "UNKNOWN";

    try {
      const result = await handler(req, res);
      const statusCode = Number(res?.statusCode || 200);

      if (statusCode >= 500) {
        Sentry.captureException(
          new Error(`Server error (${statusCode}) on ${method} ${safeUrl}`)
        );
        await Sentry.flush(2000);
      }

      return result;
    } catch (err: any) {
      const sanitizedError = isDatabaseError(err)
        ? new Error("Database operation failed")
        : err instanceof Error
        ? new Error(scrubServerString(err.message || "Internal server error"))
        : new Error("Internal server error");

      Sentry.captureException(sanitizedError);

      if (res && !res.headersSent && !res.writableEnded) {
        sendJson(res, 500, {
          success: false,
          error: "Internal server error",
        });
      }

      await Sentry.flush(2000);
    }
  };
}

