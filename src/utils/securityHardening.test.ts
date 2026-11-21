import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import {
  pool,
  getSessionSecret,
  verifySessionToken,
  generateSessionToken,
  hashPasswordNode,
  verifyPasswordMatchNode,
  validatePasswordStrength,
  BCRYPT_COST,
  getDatabaseSslConfig,
  isOriginAllowed,
  setCorsHeaders,
  checkRateLimit,
  resetRateLimit,
  setRateLimitPoolForTesting,
  getClientIp,
  verifyAuthRequest,
  verifyCsrfRequest,
  SESSION_COOKIE_NAME,
  saveLocalStore,
  loadLocalStore,
  generateSecureInviteCode,
  getDefaultInviteExpiryIso,
  expenseBodySchema,
  paymentBodySchema,
  memberBodySchema,
  tripUpsertBodySchema,
  syncMutationBodySchema,
  validateWithSchema,
  type LocalUserRecord,
  type RateLimitDbExecutor,
} from "../../api/_shared";
import { getTelegramWebhookSecret } from "../../api/telegram/_client";
import { resolveSupabaseConfig } from "./supabaseClient";

describe("Security Hardening Suite", () => {
  const baseUrl = "http://localhost:3000";

  describe("1. Missing Secret Handling", () => {
    it("fails fast in production if SESSION_SECRET is missing (even if SUPABASE_SERVICE_ROLE_KEY or POSTGRES_URL exist)", () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.SESSION_SECRET;
      const prevAuthSecret = process.env.AUTH_SECRET;
      const prevServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const prevPostgres = process.env.POSTGRES_URL;

      try {
        process.env.NODE_ENV = "production";
        delete process.env.SESSION_SECRET;
        process.env.SUPABASE_SERVICE_ROLE_KEY = "some_service_role_key";
        process.env.POSTGRES_URL = "postgres://user:pass@host:5432/db";

        expect(() => getSessionSecret()).toThrow(/SESSION_SECRET environment variable is required/);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevSecret) process.env.SESSION_SECRET = prevSecret;
        else delete process.env.SESSION_SECRET;
        if (prevAuthSecret) process.env.AUTH_SECRET = prevAuthSecret;
        else delete process.env.AUTH_SECRET;
        if (prevServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceKey;
        else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (prevPostgres) process.env.POSTGRES_URL = prevPostgres;
        else delete process.env.POSTGRES_URL;
      }
    });

    it("allows non-production environment to use development secret without throwing", () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.SESSION_SECRET;
      const prevAuthSecret = process.env.AUTH_SECRET;

      try {
        process.env.NODE_ENV = "test";
        delete process.env.SESSION_SECRET;
        delete process.env.AUTH_SECRET;

        const secret = getSessionSecret();
        expect(secret).toBeTruthy();
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevSecret) process.env.SESSION_SECRET = prevSecret;
        if (prevAuthSecret) process.env.AUTH_SECRET = prevAuthSecret;
      }
    });
  });

  describe("2. Session Token Validation & Integrity", () => {
    it("successfully generates and verifies valid session tokens", () => {
      const token = generateSessionToken("u_test_123", "security@tripsplit.app", "Sec User");
      const verified = verifySessionToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe("u_test_123");
      expect(verified?.email).toBe("security@tripsplit.app");
      expect(verified?.name).toBe("Sec User");
    });

    it("rejects tampered signatures and payloads", () => {
      const token = generateSessionToken("u_test_123", "security@tripsplit.app", "Sec User");
      const parts = token.split(".");
      expect(parts.length).toBe(3);

      // Tampered payload
      const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ userId: "u_admin", email: "admin@root.com" })).toString("base64url")}.${parts[2]}`;
      expect(verifySessionToken(tampered)).toBeNull();

      // Tampered signature
      const badSig = `${parts[0]}.${parts[1]}.invalidSignatureHexOrBase64`;
      expect(verifySessionToken(badSig)).toBeNull();

      // Malformed tokens
      expect(verifySessionToken("")).toBeNull();
      expect(verifySessionToken("random_gibberish")).toBeNull();
    });

    it("rejects expired session tokens", () => {
      const secret = getSessionSecret();
      const crypto = require("crypto");
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const expiredPayload = Buffer.from(
        JSON.stringify({
          userId: "u_expired",
          email: "exp@tripsplit.app",
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600,
        })
      ).toString("base64url");
      const sig = crypto.createHmac("sha256", secret).update(`${header}.${expiredPayload}`).digest("base64url");
      const expiredToken = `${header}.${expiredPayload}.${sig}`;

      expect(verifySessionToken(expiredToken)).toBeNull();
    });
  });

  describe("3. Password Acceptance Rules, Common Password Blocklist & Bcrypt Cost >= 12", () => {
    const rawPass = "SecretSecurePass123!";

    it("hashes new passwords with bcrypt cost of at least 12 and verifies without rehash", () => {
      expect(BCRYPT_COST).toBeGreaterThanOrEqual(12);
      const bcryptHash = hashPasswordNode(rawPass);
      expect(bcryptHash.startsWith("$2a$") || bcryptHash.startsWith("$2b$")).toBe(true);
      expect(bcrypt.getRounds(bcryptHash)).toBeGreaterThanOrEqual(12);

      const result = verifyPasswordMatchNode(rawPass, bcryptHash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(false);
      expect(result.method).toBe("bcrypt");
    });

    it("enforces minimum 8 characters and blocks top common passwords", () => {
      expect(validatePasswordStrength("short7!").valid).toBe(false);
      expect(validatePasswordStrength("password").valid).toBe(false);
      expect(validatePasswordStrength("Password123").valid).toBe(false);
      expect(validatePasswordStrength("12345678").valid).toBe(false);
      expect(validatePasswordStrength("qwerty123").valid).toBe(false);
      expect(validatePasswordStrength("aaaaaaaa").valid).toBe(false);
      expect(validatePasswordStrength("UniqueTr4vel$plit2026!").valid).toBe(true);
    });

    it("rejects exact plaintext matching", () => {
      const result = verifyPasswordMatchNode(rawPass, rawPass);
      expect(result.valid).toBe(false);
      expect(result.method).toBe("none");
    });

    it("rejects unsalted raw SHA-256 hashes", () => {
      const crypto = require("crypto");
      const unsaltedSha256 = crypto.createHash("sha256").update(rawPass).digest("hex");
      const result = verifyPasswordMatchNode(rawPass, unsaltedSha256);
      expect(result.valid).toBe(false);
    });

    it("rejects weak fallback string hashes (fb_...)", () => {
      let simpleHash = 0;
      for (let i = 0; i < rawPass.length; i++) {
        simpleHash = ((simpleHash << 5) - simpleHash + rawPass.charCodeAt(i)) | 0;
      }
      const fbHash = `fb_${Math.abs(simpleHash)}`;
      const result = verifyPasswordMatchNode(rawPass, fbHash);
      expect(result.valid).toBe(false);
    });

    it("accepts legacy salted SHA-256 and flags it for automatic rehash upgrade", () => {
      const crypto = require("crypto");
      const legacySalt = process.env.PASSWORD_SALT || "_tripsplit_salt_v1";
      const legacySha256 = crypto.createHash("sha256").update(rawPass + legacySalt).digest("hex");

      const result = verifyPasswordMatchNode(rawPass, legacySha256);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(true);
      expect(result.method).toBe("legacy_sha256");
    });
  });

  describe("4. Database SSL/TLS Security Configuration", () => {
    it("enforces strict TLS verification (rejectUnauthorized: true) by default", () => {
      const prevFlag = process.env.DB_SSL_ALLOW_INSECURE;
      delete process.env.DB_SSL_ALLOW_INSECURE;

      const sslConfig = getDatabaseSslConfig();
      expect(sslConfig).toBeDefined();
      if (typeof sslConfig === "object" && sslConfig !== null) {
        expect(sslConfig.rejectUnauthorized).toBe(true);
      }

      if (prevFlag) process.env.DB_SSL_ALLOW_INSECURE = prevFlag;
    });

    it("only allows rejectUnauthorized: false when explicitly configured with DB_SSL_ALLOW_INSECURE=true in non-production", () => {
      const prevFlag = process.env.DB_SSL_ALLOW_INSECURE;
      const prevEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = "development";
        process.env.DB_SSL_ALLOW_INSECURE = "true";
        const devSsl = getDatabaseSslConfig();
        expect(devSsl).toEqual({ rejectUnauthorized: false });

        process.env.NODE_ENV = "production";
        const prodSsl = getDatabaseSslConfig();
        expect(prodSsl).not.toEqual({ rejectUnauthorized: false });
        if (typeof prodSsl === "object" && prodSsl !== null) {
          expect(prodSsl.rejectUnauthorized).toBe(true);
        }
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevFlag) process.env.DB_SSL_ALLOW_INSECURE = prevFlag;
        else delete process.env.DB_SSL_ALLOW_INSECURE;
      }
    });
  });

  describe("5. CORS Policy Allowlist, Preflight & Spoof-Resistant Client IP", () => {
    it("allows only ALLOWED_ORIGINS, APP_URL, and localhost when NODE_ENV is not production", () => {
      const prevAllowed = process.env.ALLOWED_ORIGINS;
      const prevAppUrl = process.env.APP_URL;
      const prevEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = "test";
        process.env.ALLOWED_ORIGINS = "https://app.tripsplit.io, https://staging.tripsplit.io";
        process.env.APP_URL = "https://tripsplit.vercel.app";

        expect(isOriginAllowed("http://localhost:3000")).toBe(true);
        expect(isOriginAllowed("http://127.0.0.1:3000")).toBe(true);
        expect(isOriginAllowed("https://app.tripsplit.io")).toBe(true);
        expect(isOriginAllowed("https://staging.tripsplit.io")).toBe(true);
        expect(isOriginAllowed("https://tripsplit.vercel.app")).toBe(true);

        process.env.NODE_ENV = "production";
        expect(isOriginAllowed("http://localhost:3000")).toBe(false);
        expect(isOriginAllowed("https://app.tripsplit.io")).toBe(true);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevAllowed !== undefined) process.env.ALLOWED_ORIGINS = prevAllowed;
        else delete process.env.ALLOWED_ORIGINS;
        if (prevAppUrl !== undefined) process.env.APP_URL = prevAppUrl;
        else delete process.env.APP_URL;
      }
    });

    it("rejects https://tripsplit-evil.vercel.app, *.run.app, null, and untrusted origins", () => {
      expect(isOriginAllowed("https://tripsplit-evil.vercel.app")).toBe(false);
      expect(isOriginAllowed("https://spliito-attacker.vercel.app")).toBe(false);
      expect(isOriginAllowed("https://travelsplit-phish.vercel.app")).toBe(false);
      expect(isOriginAllowed("https://my-service-xyz.a.run.app")).toBe(false);
      expect(isOriginAllowed("null")).toBe(false);
      expect(isOriginAllowed("https://google.com")).toBe(false);
      expect(isOriginAllowed("https://malicious-site.com")).toBe(false);
      expect(isOriginAllowed("https://attacker.com")).toBe(false);
    });

    it("sets CORS headers strictly and never echoes back disallowed origins", () => {
      const headers: Record<string, string> = {};
      const mockRes: any = {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
      };

      setCorsHeaders(mockRes, "https://tripsplit-evil.vercel.app");
      expect(headers["access-control-allow-origin"]).toBeUndefined();

      setCorsHeaders(mockRes, "https://evil.com");
      expect(headers["access-control-allow-origin"]).toBeUndefined();

      setCorsHeaders(mockRes, "http://localhost:3000");
      expect(headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    });

    it("extracts client IP safely from x-vercel-forwarded-for or the last hop of x-forwarded-for (ignoring client-spoofed first hops)", () => {
      // 1. x-vercel-forwarded-for takes priority
      const vercelReq = {
        headers: {
          "x-vercel-forwarded-for": "203.0.113.10, 198.51.100.77",
          "x-forwarded-for": "1.1.1.1, 2.2.2.2",
        },
      };
      expect(getClientIp(vercelReq)).toBe("198.51.100.77");

      // 2. Client spoofs x-forwarded-for by prepending fake IPs: last hop is used
      const spoofedXffReq = {
        headers: {
          "x-forwarded-for": "10.0.0.1, 172.16.0.5, 203.0.113.250",
        },
      };
      expect(getClientIp(spoofedXffReq)).toBe("203.0.113.250");
    });
  });

  describe("6. Telegram Webhook Secret Token Verification", () => {
    it("provides configured or generated webhook secret token", () => {
      const secret = getTelegramWebhookSecret();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThanOrEqual(16);
    });

    it("rejects webhook requests with missing secret token with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ update_id: 12345 }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Missing or invalid Telegram webhook secret token/i);
    });

    it("rejects webhook requests with invalid secret token with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": "completely_wrong_secret_token",
        },
        body: JSON.stringify({ update_id: 12345 }),
      });

      expect(res.status).toBe(403);
    });

    it("accepts webhook requests with the correct secret token", async () => {
      const validSecret = getTelegramWebhookSecret();
      const res = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": validSecret,
        },
        body: JSON.stringify({
          update_id: 999999,
          message: {
            message_id: 1,
            chat: { id: 1234567, type: "private" },
            text: "/start",
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });

  describe("7. Local Fallback Storage Sanitization", () => {
    it("never persists password_hash into server_store.json", () => {
      const storeFile = path.resolve(process.cwd(), "server_store.json");
      const currentStore = loadLocalStore();

      const testUser: LocalUserRecord = {
        id: "u_test_sanitize_999",
        email: "sanitize_test@tripsplit.app",
        name: "Sanitize Test",
        phone: null,
        avatar_color: "#123456",
        password_hash: "$2b$12$superSensitivePasswordHashDoNotPersistOnDisk",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      currentStore.users.push(testUser);
      saveLocalStore(currentStore);

      if (fs.existsSync(storeFile)) {
        const rawFileContent = fs.readFileSync(storeFile, "utf-8");
        expect(rawFileContent).not.toContain("$2b$12$superSensitivePasswordHashDoNotPersistOnDisk");

        const parsed = JSON.parse(rawFileContent);
        const diskUser = parsed.users.find((u: any) => u.id === "u_test_sanitize_999");
        if (diskUser) {
          expect(diskUser.password_hash).toBe("");
        }
      }

      currentStore.users = currentStore.users.filter((u) => u.id !== "u_test_sanitize_999");
      saveLocalStore(currentStore);
    });
  });

  describe("8. Postgres-Backed Rate Limiting Across Simulated Serverless Instances", () => {
    it("shares rate-limit counts atomically across separate serverless instances and returns retryAfterSec", async () => {
      // Simulate a shared Postgres public.rate_limits backing store accessed by two separate serverless instances
      const sharedPostgresRows = new Map<string, { count: number; resetAtMs: number }>();

      const createSimulatedServerlessDbInstance = (): RateLimitDbExecutor => ({
        async query(sql: string, params: any[] = []) {
          if (sql.includes("INSERT INTO public.rate_limits")) {
            const key = String(params[0]);
            const windowMs = Number(params[1]);
            const now = Date.now();
            const existing = sharedPostgresRows.get(key);
            if (!existing || existing.resetAtMs <= now) {
              const resetAtMs = now + windowMs;
              sharedPostgresRows.set(key, { count: 1, resetAtMs });
              return {
                rows: [{ count: 1, retry_after_sec: Math.max(1, Math.ceil((resetAtMs - now) / 1000)) }],
              };
            } else {
              existing.count += 1;
              sharedPostgresRows.set(key, existing);
              return {
                rows: [
                  {
                    count: existing.count,
                    retry_after_sec: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)),
                  },
                ],
              };
            }
          }
          if (sql.includes("DELETE FROM public.rate_limits")) {
            sharedPostgresRows.delete(String(params[0]));
            return { rows: [] };
          }
          return { rows: [] };
        },
      });

      const instanceA = createSimulatedServerlessDbInstance();
      const instanceB = createSimulatedServerlessDbInstance();
      const key = `dist_rl_key_${Date.now()}`;

      // Hit 1 on Serverless Instance A
      const r1 = await checkRateLimit(key, 3, 60000, instanceA);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      // Hit 2 on Serverless Instance B (shares Postgres table state!)
      const r2 = await checkRateLimit(key, 3, 60000, instanceB);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      // Hit 3 on Serverless Instance A
      const r3 = await checkRateLimit(key, 3, 60000, instanceA);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // Hit 4 on Serverless Instance B -> throttled across instances!
      const r4 = await checkRateLimit(key, 3, 60000, instanceB);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.retryAfterSec).toBeGreaterThan(0);

      // Reset via shared Postgres table
      await resetRateLimit(key, instanceA);
      const r5 = await checkRateLimit(key, 3, 60000, instanceB);
      expect(r5.allowed).toBe(true);
      expect(r5.remaining).toBe(2);
    });

    it("returns HTTP 429 with Retry-After header when endpoint rate limit is exceeded", async () => {
      const simulatedIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
      const rateKey = `login_ip_${simulatedIp}`;
      await resetRateLimit(rateKey);

      try {
        // Exhaust 10 attempts for this IP in the shared rate_limits table
        for (let i = 0; i < 10; i++) {
          await checkRateLimit(rateKey, 10, 5 * 60 * 1000);
        }

        const res = await fetch(`${baseUrl}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-Vercel-Forwarded-For": simulatedIp,
          },
          body: JSON.stringify({
            emailOrPhone: "ratelimited@tripsplit.app",
            password: "ValidLookingPassword123!",
          }),
        });

        expect(res.status).toBe(429);
        const retryAfter = res.headers.get("retry-after");
        expect(retryAfter).toBeTruthy();
        expect(Number(retryAfter)).toBeGreaterThan(0);
      } finally {
        await resetRateLimit(rateKey);
        setRateLimitPoolForTesting(null);
      }
    });
  });

  describe("9. Frontend Supabase Client Security Safeguards", () => {
    it("fails fast in production if Supabase config is missing", () => {
      expect(() => {
        resolveSupabaseConfig({
          supabaseUrl: "",
          supabaseAnonKey: "",
          isProduction: true,
        });
      }).toThrow(/VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required/);
    });

    it("rejects service_role or secret keys from being used in the client", () => {
      expect(() => {
        resolveSupabaseConfig({
          supabaseUrl: "https://example.supabase.co",
          supabaseAnonKey: "ey...service_role...secret",
          isProduction: false,
        });
      }).toThrow(/FATAL SECURITY ERROR: service_role or secret key detected/);
    });

    it("accepts valid anonymous client configuration", () => {
      const config = resolveSupabaseConfig({
        supabaseUrl: "https://xyzcompany.supabase.co",
        supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anonkey123",
        isProduction: true,
      });

      expect(config.url).toBe("https://xyzcompany.supabase.co");
      expect(config.anonKey).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anonkey123");
    });
  });

  describe("10. End-to-End Cookie Auth Flow, Signup Duplicate Detection & Logout", () => {
    const uniqueEmail = `sec_user_${Date.now()}@tripsplit.app`;
    const password = "VerySafePassword2026!";
    let sessionCookieHeader = "";

    it("registers a new user via /api/auth/signup and sets HttpOnly, Secure, SameSite=Lax cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name: "Sec Test User",
          email: uniqueEmail,
          password: password,
          avatarColor: "#059669",
        }),
      });

      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=Lax");

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(uniqueEmail);
    });

    it("detects duplicate signup and returns HTTP 409", async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name: "Duplicate User",
          email: uniqueEmail,
          password: "AnotherSafePassword123!",
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/already exists/i);
    });

    it("successfully logs in via /api/auth/login and sets HttpOnly session cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          emailOrPhone: uniqueEmail,
          password: password,
        }),
      });

      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=Lax");

      const cookieMatch = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      expect(cookieMatch).not.toBeNull();
      sessionCookieHeader = `${SESSION_COOKIE_NAME}=${cookieMatch![1]}`;

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(uniqueEmail);
    });

    it("authenticates protected requests using the HttpOnly cookie first (without Authorization header)", async () => {
      expect(sessionCookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);

      // Direct unit verification that cookie takes priority over Bearer fallback
      const otherBearer = generateSessionToken("other_fallback_user", "other@tripsplit.app", "Other");
      const authCheck = await verifyAuthRequest({
        method: "GET",
        headers: {
          cookie: sessionCookieHeader,
          authorization: `Bearer ${otherBearer}`,
        },
      });
      expect(authCheck.authorized).toBe(true);
      expect(authCheck.authSource).toBe("cookie");
      expect(authCheck.email).toBe(uniqueEmail);

      // End-to-end request to /api/user-trips using only Cookie header
      const res = await fetch(`${baseUrl}/api/user-trips`, {
        method: "GET",
        headers: {
          Cookie: sessionCookieHeader,
        },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("clears the HttpOnly session cookie on /api/auth/logout", async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Cookie: sessionCookieHeader,
        },
      });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("Max-Age=0");
      expect(setCookie).toContain("HttpOnly");
    });

    it("rejects login with wrong password without leaking account existence", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          emailOrPhone: uniqueEmail,
          password: "WrongPasswordEntirely123!",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/Invalid email\/phone or password/i);
    });

    afterAll(async () => {
      if (pool) {
        try {
          await pool.query("DELETE FROM public.users WHERE email = $1;", [uniqueEmail]);
        } catch {}
      }
      try {
        const store = loadLocalStore();
        store.users = store.users.filter((u) => u.email !== uniqueEmail);
        saveLocalStore(store);
      } catch {}
    });
  });

  describe("11. CSRF Protection on State-Changing Requests", () => {
    const validToken = generateSessionToken("u_csrf_tester", "csrf@tripsplit.app", "CSRF Tester");

    it("rejects state-changing POST/PUT/DELETE requests missing X-Requested-With header with 403", async () => {
      // 1. Login without X-Requested-With
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrPhone: "csrf@tripsplit.app", password: "ValidPassword123!" }),
      });
      expect(loginRes.status).toBe(403);

      // 2. Authenticated mutation with Cookie but without X-Requested-With
      const mutRes = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        },
        body: JSON.stringify({
          type: "SAVE_ACTIVITY",
          tripId: "trip_123",
          payload: { id: "act_1", action: "test" },
        }),
      });
      expect(mutRes.status).toBe(403);
    });

    it("rejects state-changing requests from an untrusted Origin header with 403 even if X-Requested-With is set", async () => {
      const csrfCheck = verifyCsrfRequest({
        method: "POST",
        headers: {
          origin: "https://evil-csrf-attacker.example.com",
          "x-requested-with": "XMLHttpRequest",
        },
      });
      expect(csrfCheck.valid).toBe(false);

      const res = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Origin: "https://evil-csrf-attacker.example.com",
          Cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        },
        body: JSON.stringify({
          type: "SAVE_ACTIVITY",
          tripId: "trip_123",
          payload: { id: "act_1", action: "test" },
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("12. Cross-User Trip Read & Write Isolation (Must Return 403)", () => {
    const ownerId = `u_iso_owner_${Date.now()}`;
    const intruderId = `u_iso_intruder_${Date.now()}`;
    const testTripId = `trip_iso_${Date.now()}`;
    const ownerToken = generateSessionToken(ownerId, "owner.iso@tripsplit.app", "Owner");
    const intruderToken = generateSessionToken(intruderId, "intruder.iso@tripsplit.app", "Intruder");

    it("allows owner to create a trip and blocks another user from reading or writing it with 403", async () => {
      try {
        // 1. Owner creates trip
        const createRes = await fetch(`${baseUrl}/api/trips`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            Cookie: `${SESSION_COOKIE_NAME}=${ownerToken}`,
          },
          body: JSON.stringify({
            id: testTripId,
            title: "Private Owner Trip",
            currency: "INR",
            status: "ACTIVE",
            ownerId,
            ownerName: "Owner",
            members: [{ id: ownerId, userId: ownerId, name: "Owner", role: "admin" }],
          }),
        });
        expect(createRes.status).toBe(200);

        // 2. Intruder attempts to READ owner's trip -> 403
        const readRes = await fetch(`${baseUrl}/api/trips/${testTripId}`, {
          method: "GET",
          headers: {
            Cookie: `${SESSION_COOKIE_NAME}=${intruderToken}`,
          },
        });
        expect(readRes.status).toBe(403);

        // 3. Intruder attempts to WRITE an expense to owner's trip -> 403
        const writeExpRes = await fetch(`${baseUrl}/api/trips/${testTripId}/expenses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            Cookie: `${SESSION_COOKIE_NAME}=${intruderToken}`,
          },
          body: JSON.stringify({
            id: `exp_intruder_${Date.now()}`,
            title: "Unauthorized Expense",
            amount: 500,
            paidBy: intruderId,
            method: "equal",
          }),
        });
        expect(writeExpRes.status).toBe(403);

        // 4. Intruder attempts to DELETE owner's trip -> 403
        const deleteRes = await fetch(`${baseUrl}/api/trips/${testTripId}`, {
          method: "DELETE",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Cookie: `${SESSION_COOKIE_NAME}=${intruderToken}`,
          },
        });
        expect(deleteRes.status).toBe(403);
      } finally {
        if (pool) {
          await pool.query("DELETE FROM public.trips WHERE id = $1;", [testTripId]).catch(() => {});
        }
      }
    });
  });

  describe("13. Zod Input Validation Rules (Max Lengths, Numeric Ranges, ID Formats & Enums)", () => {
    const validToken = generateSessionToken("u_val_tester", "val@tripsplit.app", "Validator");

    it("rejects negative or excessive amounts, invalid IDs, invalid enums, and overlong fields with 400", async () => {
      // 1. Negative expense amount
      expect(
        validateWithSchema(expenseBodySchema, {
          id: "exp_1",
          title: "Negative Expense",
          amount: -50,
        }).success
      ).toBe(false);

      // 2. Excessive expense amount (> 100,000,000)
      expect(
        validateWithSchema(expenseBodySchema, {
          id: "exp_1",
          title: "Huge Expense",
          amount: 999_999_999,
        }).success
      ).toBe(false);

      // 3. Path traversal / malformed ID format
      expect(
        validateWithSchema(expenseBodySchema, {
          id: "../etc/passwd",
          title: "Bad ID",
          amount: 100,
        }).success
      ).toBe(false);

      // 4. Disallowed enum value on split method, member role, and trip currency
      expect(
        validateWithSchema(expenseBodySchema, {
          id: "exp_1",
          title: "Bad Method",
          amount: 100,
          method: "unsupported_magic_split",
        }).success
      ).toBe(false);

      expect(
        validateWithSchema(memberBodySchema, {
          id: "mem_1",
          name: "Traveler",
          role: "super_root_hacker",
        }).success
      ).toBe(false);

      expect(
        validateWithSchema(tripUpsertBodySchema, {
          id: "trip_1",
          title: "Valid Title",
          currency: "FAKE_COIN",
        }).success
      ).toBe(false);

      // 5. Overlong title (> 200 chars)
      expect(
        validateWithSchema(expenseBodySchema, {
          id: "exp_1",
          title: "A".repeat(250),
          amount: 100,
        }).success
      ).toBe(false);

      // 6. Disallowed mutation type in /api/sync/mutation returns 400
      const badMutRes = await fetch(`${baseUrl}/api/sync/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        },
        body: JSON.stringify({
          type: "DROP_ALL_TABLES",
          tripId: "trip_123",
          payload: {},
        }),
      });
      expect(badMutRes.status).toBe(400);

      // 7. Weak / common password on /api/auth/signup returns 400
      const weakSignupRes = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name: "Weak Pass User",
          email: `weak_${Date.now()}@tripsplit.app`,
          password: "password123",
        }),
      });
      expect(weakSignupRes.status).toBe(400);
    });
  });

  describe("14. Password Reset & Invite Lookup Security Regression Checks", () => {
    it("update-password rejects a request with an email in the body but no valid session", async () => {
      const res = await fetch(`${baseUrl}/api/auth/update-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          action: "update-password",
          email: "ayanroy525@gmail.com",
          newPassword: "AttackerNewPassword123!",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.token).toBeUndefined();
    });

    it("invite lookup returns only trip name and memberCount and does not leak ownerId or member IDs/names", async () => {
      const res = await fetch(`${baseUrl}/api/trips/invite/lookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ inviteCode: "TRIP-F25K4S" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.trip).toBeDefined();
      expect(data.trip.title || data.trip.name).toBe("Goa");
      expect(typeof data.trip.memberCount).toBe("number");
      expect(data.trip.ownerId).toBeUndefined();
      expect(data.trip.owner_id).toBeUndefined();
      expect(data.trip.ownerName).toBeUndefined();
      expect(data.trip.memberUserIds).toBeUndefined();
      expect(data.trip.member_user_ids).toBeUndefined();
      expect(data.trip.members).toBeUndefined();
    });

    it("generates cryptographic invite codes with at least 8 random characters and an expiry date", () => {
      const code = generateSecureInviteCode();
      expect(code.startsWith("TRIP-")).toBe(true);
      const randomPart = code.replace("TRIP-", "");
      expect(randomPart.length).toBeGreaterThanOrEqual(8);

      const expiry = getDefaultInviteExpiryIso();
      expect(new Date(expiry).getTime()).toBeGreaterThan(Date.now());
    });
  });
});
