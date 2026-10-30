# Telegram Diagnostic Reports with Interactive Auto-Fix Approval

Automated daily system health checks with rich Telegram reporting, error alerting, and interactive inline buttons that allow you to approve or reject self-healing actions directly from Telegram.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed through interactive clarification and will guide the build:

- **Configuration Location**: Configured via a dedicated **Telegram Alerts & Webhook** tab in the in-app **System Health Dashboard** (`SystemHealthModal`), with an instant "Send Test Message" button to verify the Bot Token and Chat ID before enabling. Settings are securely stored in the PostgreSQL `public.health_checks_config` table (with fallback to local environment variables).
- **Interactive Action Protocol**: Utilizes a serverless **Telegram Bot Webhook** (`/api/telegram/webhook`). When a diagnostic alert is sent, it includes Telegram inline keyboard buttons (`[✅ Approve Auto-Fix]` and `[❌ Reject / Report Only]`). Tapping a button triggers a signed callback query to the app backend.
- **Automated Fix Capabilities (Executed Only on Approval)**:
  1. **Re-grant PostgreSQL Permissions**: Re-declares `SECURITY DEFINER` and grants execution on `public.lookup_user_for_auth`, `public.get_user_trips_data`, and all 6 core tables to `anon, authenticated, service_role`.
  2. **Connection Pool & Session Healing**: Drains and re-initializes stale database connection pools when connection timeouts or socket resets occur.
  3. **Schema & Table Integrity Re-sync**: Re-creates missing tables, indexes, or columns if schema drift is detected.
- **Strict Consent Enforcement**: If you tap **Reject**, the bot applies **zero fixes**, records your decision in the audit log, and preserves the diagnostic state.

---

## 1. Overview & Core Concept

- **What It Does**: Bridges the 2:00 AM automated diagnostic sweep (and manual runs) with your Telegram account. 
  - If all checks pass, Telegram receives a clean green summary of system performance, table counts, and latency.
  - If any failure occurs (e.g. Supabase RLS permission blockage, connection failure, missing functions, schema drift), Telegram receives an urgent incident notification with the root cause, planned remediation, and interactive inline buttons asking for your consent.
  - Tapping **Approve** immediately executes the remediation script, verifies resolution with a fresh diagnostic sweep, and edits the Telegram message in-place to confirm the fix.
  - Tapping **Reject** cancels the automated fix and logs your decision.
- **Target Persona**: Application administrator and trip owners managing multi-user expense ledgers across Vercel, Cloudflare, and Supabase.
- **Key Value**: Hands-off peace of mind with human-in-the-loop control—no unexpected login lockouts or database failures, and zero changes made without your explicit approval.

---

## 2. User Experience & Visual Design

### A. Telegram Notification Experience

```
┌────────────────────────────────────────────────────────┐
│ 🔴 TripSplit System Alert: Issues Detected (2:00 AM)   │
│                                                        │
│ Status: DEGRADED (Latency: 640ms)                      │
│ Tables: users: 7 · trips: 4 · expenses: 23             │
│                                                        │
│ ⚠️ Detected Issue:                                     │
│ Permission denied on public.lookup_user_for_auth       │
│ Users cannot log in on deployed client apps.           │
│                                                        │
│ 🛠️ Proposed Auto-Fix:                                 │
│ Re-grant SECURITY DEFINER & RPC permissions to anon/   │
│ authenticated roles for authentication functions.      │
│                                                        │
│ [ ✅ Approve Auto-Fix ]    [ ❌ Reject / Report Only ] │
└────────────────────────────────────────────────────────┘
```

- **Upon Tapping `[✅ Approve Auto-Fix]`**:
  - The inline button shows an instant loading spinner via Telegram's `answerCallbackQuery`.
  - The backend executes the self-healing routine (`healDatabasePermissions`).
  - The message is edited in-place:
    ```
    ✅ RESOLVED: Auto-Fix Executed & Verified
    Approved by Admin at 02:01 AM
    • Re-granted RPC permissions on lookup_user_for_auth
    • Re-tested auth lookup: SUCCESS (latency 65ms)
    System status restored to NOMINAL.
    ```
- **Upon Tapping `[❌ Reject / Report Only]`**:
  - The message is edited in-place:
    ```
    ⚠️ Auto-Fix Rejected by Admin
    Recorded at 02:01 AM. No changes were made to the database.
    ```

### B. In-App Telegram Settings UI (Inside `SystemHealthModal`)

- **Tabbed Interface**: A new segmented tab **"Telegram Alerts"** alongside "Overview" and "Audit History".
- **Bot Token & Chat ID Inputs**: Clean input fields with show/hide password toggle for the Bot Token.
- **Interactive Verification**:
  - **"Send Test Message" button**: Sends an immediate sample notification to verify Telegram connectivity.
  - **"Register Webhook" button**: Sets the webhook URL (`/api/telegram/webhook`) with Telegram API and shows status.
- **Quiet Aesthetic & Zero-Pill Rules**:
  - Clean unboxed metadata with `·` separators.
  - Monospace tabular numerals (`font-mono tabular-nums`) for Telegram IDs and latency timings.
  - Dark slate aesthetic matching the existing TripSplit theme tokens (`#0F172A`, `#1E293B`, `#2DD4BF`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Webhook vs. Long-Polling for Button Clicks**:
  - *Chosen Approach*: Webhook endpoint (`POST /api/telegram/webhook`).
  - *Why*: Webhooks do not consume server memory or keep idle connections open. In serverless environments (Vercel / Cloudflare), long-polling is impossible, whereas webhooks handle callbacks instantly.
- **Decision 2: In-App Config with PostgreSQL Persistence**:
  - *Chosen Approach*: Store bot credentials in a restricted PostgreSQL table `public.health_checks_config` with environment variable fallback.
  - *Why*: Allows you to configure and rotate your bot token without having to redeploy code or reconfigure Vercel environment variables every time.
- **Decision 3: Non-Destructive Self-Healing Boundary**:
  - *Chosen Approach*: Self-healing is strictly bounded to idempotent repair actions (permissions, function declarations, connection pool flushes, table recreation).
  - *Why*: Prevents data corruption or accidental data loss while giving the bot the power to fix common deployment issues (e.g. Supabase RLS lockout).

---

## 4. Technical Architecture & Data Strategy

### System Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Daily 2:00 AM Health Sweep Engine                    │
│                        (api/health/_runner.ts)                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Evaluates DB, 6 Tables & Auth RPCs
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Telegram Dispatcher (api/telegram.ts)                 │
│  - If Nominal: Sends executive status summary                          │
│  - If Issue: Sends alert + Inline Keyboard [Approve] / [Reject]        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS POST (Telegram Bot API)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Telegram Mobile / Web App                      │
│                  Admin reviews issue details & tap choices             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ User taps [✅ Approve] or [❌ Reject]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             Webhook Endpoint: POST /api/telegram/webhook               │
│                                                                        │
│  1. Verifies Telegram callback signature                               │
│  2. If Reject -> updates message to "Rejected", exits safely           │
│  3. If Approve:                                                        │
│     a. Invokes healDatabaseIssues(issueType)                           │
│     b. Runs fresh diagnostic sweep to confirm nominal status           │
│     c. Calls Telegram editMessageText to update chat with resolution   │
└────────────────────────────────────────────────────────────────────────┘
```

### Endpoints & Modules to Implement

1. **`api/telegram/_client.ts`**:
   - `sendTelegramMessage(text, inlineKeyboard?)`: Dispatches formatted messages.
   - `updateTelegramMessage(chatId, messageId, text, inlineKeyboard?)`: Updates message text in-place.
   - `answerCallbackQuery(callbackQueryId, text)`: Acknowledges button clicks with instant Telegram toast.
2. **`api/telegram/_healer.ts`**:
   - `healDatabasePermissions()`: Executes idempotent SQL to fix `SECURITY DEFINER` and grants for auth functions.
   - `healConnectionPool()`: Re-establishes connection pool and verifies alive status.
   - `healMissingTables()`: Ensures all 6 required tables and schemas exist.
3. **`api/telegram/webhook.ts`**:
   - Handles `callback_query` payload from Telegram inline button clicks.
   - Executes healing routine upon `action: "approve"`.
   - Records decisions to `public.health_checks`.
4. **`api/telegram/test.ts` & `api/telegram/settings.ts`**:
   - Tests credentials and persists configuration.
5. **Frontend UI in `SystemHealthModal.tsx`**:
   - Add "Telegram Integration" configuration tab with token inputs, test button, and webhook registration.
