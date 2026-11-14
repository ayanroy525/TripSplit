import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  pool,
  getSessionSecret,
  verifySessionToken,
  generateSessionToken,
  hashPasswordNode,
  verifyPasswordMatchNode,
  getDatabaseSslConfig,
  isOriginAllowed,
  setCorsHeaders,
  checkRateLimit,
  resetRateLimit,
  saveLocalStore,
  loadLocalStore,
  generateSecureInviteCode,
  getDefaultInviteExpiryIso,
  type LocalUserRecord,
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
          exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
        })
      ).toString("base64url");
      const sig = crypto.createHmac("sha256", secret).update(`${header}.${expiredPayload}`).digest("base64url");
      const expiredToken = `${header}.${expiredPayload}.${sig}`;

      expect(verifySessionToken(expiredToken)).toBeNull();
    });
  });

  describe("3. Password Acceptance Rules & Legacy Upgrade Flagging", () => {
    const rawPass = "SecretSecurePass123!";

    it("verifies modern bcrypt hashes without requiring rehash", () => {
      const bcryptHash = hashPasswordNode(rawPass);
      expect(bcryptHash.startsWith("$2a$") || bcryptHash.startsWith("$2b$")).toBe(true);

      const result = verifyPasswordMatchNode(rawPass, bcryptHash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(false);
      expect(result.method).toBe("bcrypt");
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

        // In production, DB_SSL_ALLOW_INSECURE must NOT weaken verification
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

  describe("5. CORS Policy Allowlist & Preflight", () => {
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

        // In production, localhost is rejected
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

    it("sets CORS headers strictly and never echoes back disallowed origins like https://tripsplit-evil.vercel.app", () => {
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
        password_hash: "$2b$10$superSensitivePasswordHashDoNotPersistOnDisk",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      currentStore.users.push(testUser);
      saveLocalStore(currentStore);

      // Read raw file from disk
      if (fs.existsSync(storeFile)) {
        const rawFileContent = fs.readFileSync(storeFile, "utf-8");
        expect(rawFileContent).not.toContain("$2b$10$superSensitivePasswordHashDoNotPersistOnDisk");

        const parsed = JSON.parse(rawFileContent);
        const diskUser = parsed.users.find((u: any) => u.id === "u_test_sanitize_999");
        if (diskUser) {
          expect(diskUser.password_hash).toBe("");
        }
      }

      // Cleanup
      currentStore.users = currentStore.users.filter((u) => u.id !== "u_test_sanitize_999");
      saveLocalStore(currentStore);
    });
  });

  describe("8. Rate Limiting Protection", () => {
    const testKey = `test_rate_limit_${Date.now()}`;

    it("allows requests under the limit and throttles requests exceeding limit", () => {
      resetRateLimit(testKey);

      // Allow 3 attempts
      const r1 = checkRateLimit(testKey, 3, 60000);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = checkRateLimit(testKey, 3, 60000);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = checkRateLimit(testKey, 3, 60000);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // 4th attempt should be blocked
      const r4 = checkRateLimit(testKey, 3, 60000);
      expect(r4.allowed).toBe(false);
      expect(r4.retryAfterSec).toBeGreaterThan(0);

      // Reset works
      resetRateLimit(testKey);
      const r5 = checkRateLimit(testKey, 3, 60000);
      expect(r5.allowed).toBe(true);
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

  describe("10. End-to-End Auth: Signup Duplicate Detection & Bcrypt Login", () => {
    const uniqueEmail = `sec_user_${Date.now()}@tripsplit.app`;
    const password = "VerySafePassword2026!";

    it("registers a new user with bcrypt hash via /api/auth/signup", async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sec Test User",
          email: uniqueEmail,
          password: password,
          avatarColor: "#059669",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe(uniqueEmail);
    });

    it("detects duplicate signup and returns HTTP 409", async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Duplicate User",
          email: uniqueEmail,
          password: "AnotherPassword123!",
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/already exists/i);
    });

    it("successfully logs in with valid credentials via /api/auth/login", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrPhone: uniqueEmail,
          password: password,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe(uniqueEmail);
    });

    it("rejects login with wrong password without leaking account existence", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrPhone: uniqueEmail,
          password: "WrongPasswordEntirely",
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

  describe("11. Password Reset & Invite Lookup Security Regression Checks", () => {
    it("update-password rejects a request with an email in the body but no valid session", async () => {
      const res = await fetch(`${baseUrl}/api/auth/update-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: "TRIP-F25K4S" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.trip).toBeDefined();
      expect(data.trip.title || data.trip.name).toBe("Goa");
      expect(typeof data.trip.memberCount).toBe("number");
      // Must NOT leak ownerId, memberUserIds, or members array
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
