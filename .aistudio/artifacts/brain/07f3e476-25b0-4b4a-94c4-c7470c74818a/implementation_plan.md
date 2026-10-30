# Repository Security Hardening & Vulnerability Remediation Plan

A comprehensive, defense-in-depth security hardening plan for `ayanroy525/TripSplit`, remediating all 9 high-risk vulnerability classes across credentials, authentication, database TLS, CORS, webhook verification, and brute-force protection.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during the interactive clarification phase:
> - **Legacy Account Migration**: Existing accounts with legacy password hashes will be verified via a safe migration path and automatically upgraded to modern `bcrypt` hashes on their next successful login.
> - **Database TLS Verification**: Strict TLS certificate verification (`rejectUnauthorized: true`) is enforced by default. Bypassing certificate verification (`rejectUnauthorized: false`) is only permitted in non-production environments when explicitly configured via `DB_SSL_ALLOW_INSECURE=true`.

---

## 1. Overview & Core Concept

### Goal
Perform a production-grade security hardening pass across both client and serverless API endpoints without breaking legitimate trip workflows, split calculations, or user sessions.

### Targeted Vulnerability Classes
1. **Hardcoded Fallback Secrets**: Eliminating default `"tripsplit_session_secret_dev"` and weak salts; enforcing fail-fast secret validation in production.
2. **Insecure Password Paths**: Removing plain-text comparisons, unsalted SHA-256, and simple hash fallbacks; enforcing bcrypt with automatic migration on login.
3. **Database SSL/TLS**: Replacing `rejectUnauthorized: false` with secure TLS verification by default.
4. **Telegram Webhook Verification**: Enforcing `X-Telegram-Bot-Api-Secret-Token` header verification on all incoming webhook dispatches.
5. **CORS Allowlist**: Restricting origins to trusted domains (`localhost`, authorized `*.run.app` URLs) and removing `google.com` or `"null"` reflections.
6. **Local Fallback Storage Sanitization**: Stripping `password_hash` from `server_store.json` and in-memory caches.
7. **Rate Limiting & Anti-Brute-Force**: Enforcing sliding-window request throttling on `/api/auth/login` and `/api/auth/signup`.
8. **Client User Enumeration**: Eliminating `from("users").select("*")` in the browser; routing all authentication and credential checks through hardened backend routes.
9. **Client Secret Decoupling**: Removing hardcoded default Supabase keys in production; strictly rejecting service-role secrets from frontend bundles.

---

## 2. User Experience & Visual Design

### User Experience Continuity
- **Zero Disruptions for Legitimate Users**: Authorized users experience identical login, signup, and trip navigation speeds.
- **Clear Error Messaging**: Failed login attempts provide clear, non-leaking feedback (`"Invalid credentials"` or `"Too many failed attempts. Please try again in 5 minutes."`).
- **Seamless Password Upgrade**: Travelers with legacy accounts log in as usual; their account is transparently re-hashed to bcrypt in PostgreSQL in the background.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Server-Authoritative Authentication Flow
- **Chosen Approach**: All login and signup requests are handled server-side via `/api/auth/login` and `/api/auth/signup`.
- **Why**: Eliminates client-side database queries to `public.users` and prevents the browser from ever handling or comparing password hashes.
- **Alternatives Considered**: Direct Supabase client queries were rejected because they expose user records to client inspection.

### Decision 2: In-Memory Sliding-Window Rate Limiting
- **Chosen Approach**: Lightweight in-memory rate limiter tracking failed attempts by IP and identifier (email/phone) with automatic window expiration.
- **Why**: Protects against automated credential stuffing without adding heavy Redis or external infrastructure dependencies.
- **Trade-Off**: Rate limits reset on server process restart, which is safe and standard for containerized environments.

### Decision 3: Fail-Fast Secret Validation
- **Chosen Approach**: In production (`NODE_ENV === "production"`), the server throws an immediate initialization error if `SESSION_SECRET` or `AUTH_SECRET` is missing.
- **Why**: Prevents silent fallback to predictable keys that could allow forged session tokens.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                                 │
│  ┌────────────────────────┐                   ┌──────────────────────────┐  │
│  │   AuthContext.tsx      │                   │   Vite Client Env        │  │
│  │   (No user enumeration │                   │   (No service_role keys; │  │
│  │    or client password  │                   │    explicit anon key)    │  │
│  │    hash comparison)    │                   └─────────────┬────────────┘  │
│  └───────────┬────────────┘                                 │               │
└──────────────┼──────────────────────────────────────────────┼───────────────┘
               │ POST /api/auth/login                         │ HTTPS API
               ▼                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXPRESS SERVER & APIS                             │
│  ┌────────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐ │
│  │  Strict CORS Allowlist │  │ Rate Limiter Guard    │  │ Webhook Secret  │ │
│  │  (No google.com/null)  │  │ (Max 5 / 5 min / IP)  │  │ (X-Telegram-    │ │
│  └───────────┬────────────┘  └───────────┬───────────┘  │  Bot-Api-Token) │ │
│              │                           │              └────────┬────────┘ │
│              ▼                           ▼                       │          │
│  ┌───────────────────────────────────────────────────┐           │          │
│  │  api/_shared.ts                                   │           │          │
│  │  - Fail-fast SESSION_SECRET validation            │           │          │
│  │  - Strict DB TLS (rejectUnauthorized: true)       │           │          │
│  │  - bcrypt.compareSync + legacy auto-upgrade       │           │          │
│  │  - Sanitized local fallback (no password_hash)    │           │          │
│  └───────────────────────────┬───────────────────────┘           │          │
└──────────────────────────────┼───────────────────────────────────┼──────────┘
                               │ Pool Connection (Strict TLS)      │
                               ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          POSTGRESQL DATABASE                                │
│  - Users table: modern bcrypt password_hash                                 │
│  - health_checks_config: secret webhook token                               │
│  - Row Level Security enforced on all tables                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Implementation Steps & Targeted Files

1. **`api/_shared.ts`**:
   - Add production fail-fast check for `SESSION_SECRET` / `AUTH_SECRET`.
   - Update `pool` SSL configuration: enable strict verification (`rejectUnauthorized: true`) by default; allow self-signed only when `DB_SSL_ALLOW_INSECURE === "true"` in non-production.
   - Refactor `verifyPasswordMatchNode`: remove plaintext comparison, unsalted SHA-256, and simple hash. Return `{ valid: boolean; needsRehash: boolean }` so callers know to upgrade hashes.
   - Refactor `setCorsHeaders`: define strict origin allowlist (`localhost`, `127.0.0.1`, matching `*.run.app` or configured origins). Deny untrusted origins.
   - Refactor `saveLocalStore`: omit `password_hash` when persisting to `server_store.json`.
   - Add `checkRateLimit(key, maxAttempts, windowMs)` helper.

2. **`api/auth/login.ts` & `api/auth/signup.ts`**:
   - Enforce rate limiting per IP and identifier.
   - On successful login with legacy hash, update PostgreSQL record with modern bcrypt hash.
   - Ensure local fallback user record never stores plaintext or unsalted hashes.

3. **`api/telegram/webhook.ts`**:
   - Inspect `req.headers["x-telegram-bot-api-secret-token"]`.
   - Validate against `TELEGRAM_WEBHOOK_SECRET` or database config; reject with 401/403 if invalid.

4. **`src/context/AuthContext.tsx`**:
   - Remove client-side `from("users").select("*")` enumeration and client-side password hash comparison.
   - Direct all credential validation through the hardened `/api/auth/login` and `/api/auth/signup` endpoints.

5. **`src/utils/supabaseClient.ts`**:
   - Require explicit environment variables in production; disallow fallback keys in production.
   - Enforce separation between anon and secret keys.

6. **`server.ts`**:
   - Mount hardened CORS, rate limiting, and route handlers.

7. **Automated Security Test Suite**:
   - Create `src/utils/securityHardening.test.ts` covering:
     - Missing secret handling in production vs development.
     - Valid vs invalid session tokens.
     - Legacy password hashing rejection rules (plaintext, simple hash, unsalted rejected).
     - Telegram webhook header verification (rejecting missing/invalid tokens).
     - Secure DB SSL configuration resolution.
     - CORS allowlist enforcement and denylist rejection.
     - Exclusion of `password_hash` in fallback persistence.
     - Login rate limiting and brute-force throttling.
     - Duplicate signup detection.
     - Successful login and bcrypt hash upgrade verification.
