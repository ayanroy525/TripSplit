# End-to-End Security Architecture & Hardening Review

A comprehensive, defense-in-depth security audit and hardening specification for TripSplit, ensuring complete credential confidentiality, zero secret leaks, multi-tenant trip data isolation via PostgreSQL Row Level Security (RLS), and tamper-proof administrator telemetry.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during the interactive clarification phase:
> - **Audit Scope**: Full end-to-end security audit and verification across credentials, database Row Level Security (RLS), API route guards, and client visibility.
> - **Telegram Bot Credentials**: Kept strictly in server environment variables (`process.env.TELEGRAM_BOT_TOKEN`) and database configuration—never hardcoded in source code or committed to Git.
> - **Admin Guard**: Internal database diagnostics and health telemetry remain restricted to the application owner (`ayanroy525@gmail.com`).

---

## 1. Overview & Core Concept

### What It Delivers
TripSplit handles private group travel finances, expense settlements, and multi-user payments. Because travel groups share financial and contact information (names, emails, phone numbers, and payment details), the application must enforce airtight multi-tenant boundaries and prevent unauthorized data inspection.

### Target Personas & Threat Model
1. **Anonymous Visitors / Strangers**: Anyone loading the app link or attempting to crawl endpoints. Must not access any trip details, user profiles, or database telemetry.
2. **Group Participants & Viewers**: Authenticated members belonging to Trip A. Must only access Trip A records and never inspect, modify, or delete Trip B records (IDOR protection).
3. **Application Owner / Admin (`ayanroy525@gmail.com`)**: The sole user authorized to inspect PostgreSQL database latency, table metrics, and diagnostic triggers.

---

## 2. User Experience & Visual Design

### Key User Flows & Visual Security Posture
- **Consumer-Grade Interface**: The app provides a clean, clutter-free travel interface with zero developer telemetry, debug logs, or internal database health icons exposed in the public navigation bar.
- **Trip Access Gate**: When an invited traveler arrives via an invite link or join code (e.g. `TRIP-GF3BYE`), the interface displays a minimal trip confirmation card with destination, date range, and current member count before confirming membership.
- **Granular Role Badging**: Trip members are clearly displayed as Organizer (`Admin`), Member (`Participant`), or Read-Only (`Viewer`), reflecting their exact database authorization tier.
- **Admin System Health Drawer**: Accessible exclusively to the verified admin via the trip settings menu; hidden and unmounted for all other travelers.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Defense-in-Depth (Dual-Layer Authorization)
- **Chosen Approach**: Enforce security at both the **Node.js Express API layer** (`authMiddleware`, `checkTripAuthorization`, `adminOnlyMiddleware`) AND the **PostgreSQL database engine layer** (Row Level Security policies, trigger guards, and atomic RPC stored procedures).
- **Why**: Even if an attacker attempts to bypass API routes or interact directly with database procedures, the database engine itself rejects unauthorized queries.
- **Trade-Off**: Requires maintaining synchronized access checks in both TypeScript and SQL, verified through our 121-test automated suite.

### Decision 2: Zero Hardcoded Credentials & Repository Cleansing
- **Chosen Approach**: All secret tokens (PostgreSQL connection URL, Telegram Bot Token, JWT Session Secret, Password Salts) are resolved exclusively through `process.env`. The local `data/` folder is explicitly ignored in `.gitignore`.
- **Why**: Eliminates future automated alerts from GitHub Secret Scanning and prevents credentials from leaking to public or collaborator repository forks.

### Decision 3: Token Versioning for Instant Session Revocation
- **Chosen Approach**: User records in PostgreSQL maintain a `token_version` column. When a password is changed or an account is logged out across devices, the server increments `token_version`.
- **Why**: Provides instantaneous global revocation without requiring expensive server-side distributed cache lookups for every request.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                                 │
│  ┌───────────────────────┐   ┌──────────────────────┐   ┌─────────────────┐ │
│  │  Consumer Travel UI   │   │  Invite Join Modal   │   │ Admin Health    │ │
│  │  (Expenses, Balances) │   │  (Input Sanitized)   │   │ (Admin Email)   │ │
│  └───────────┬───────────┘   └──────────┬───────────┘   └────────┬────────┘ │
└──────────────┼──────────────────────────┼────────────────────────┼──────────┘
               │ Bearer JWT Token         │ Public Invite Code     │ Bearer JWT (Admin)
               ▼                          ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXPRESS SERVER BACKEND                            │
│  ┌───────────────────────┐   ┌──────────────────────┐   ┌─────────────────┐ │
│  │ authMiddleware        │   │ /api/trips/invite/*  │   │ adminOnly-      │ │
│  │ (Token + Version Ver) │   │ (Public Query Rate)  │   │ Middleware      │ │
│  └───────────┬───────────┘   └──────────┬───────────┘   └────────┬────────┘ │
│              │                          │                        │          │
│              ▼                          │                        │          │
│  ┌───────────────────────────────────┐  │                        │          │
│  │ checkTripAuthorization()          │  │                        │          │
│  │ (Prevents IDOR across trips)      │  │                        │          │
│  └───────────┬───────────────────────┘  │                        │          │
└──────────────┼──────────────────────────┼────────────────────────┼──────────┘
               │                          │                        │
               ▼                          ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL DATABASE ENGINE                          │
│  ┌───────────────────────┐   ┌──────────────────────┐   ┌─────────────────┐ │
│  │ Row Level Security    │   │ Atomic RPC Procs     │   │ Private Schema  │ │
│  │ (RLS on all tables)   │   │ (ACID Transactions)  │   │ (Internal Stored│ │
│  └───────────────────────┘   └──────────────────────┘   │  Procedures)    │ │
│                                                         └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Verified Security Controls

| Security Domain | Control Mechanism | Status |
| :--- | :--- | :--- |
| **Credential Storage** | `process.env.TELEGRAM_BOT_TOKEN`, `process.env.SESSION_SECRET`, `data/` in `.gitignore` | **Secured** (Zero hardcoded secrets) |
| **Trip Isolation (IDOR)** | Server-side `checkTripAuthorization()` verifies requester membership before returning trip data | **Verified** (`backendAuthSecurity.test.ts` passed) |
| **Granular RLS Policies** | PostgreSQL triggers block participants from editing other members' expenses or promoting themselves | **Verified** (`granularPermissions.test.ts` passed) |
| **Atomic Transactions** | `save_expense_atomic`, `record_payment_atomic` execute in ACID transaction blocks | **Verified** (`atomicTransactions.test.ts` passed) |
| **Admin Telemetry Guard** | `/api/db/status`, `/api/health/*`, and `/api/telegram/*` protected by `adminOnlyMiddleware` | **Verified** (401/403 enforced) |
| **Password Security** | Standard salted bcrypt password hashing (`bcrypt.hash(password, 10)`) | **Verified** (Zero plaintext storage) |
| **URL Parameter Parsing** | Case-insensitive normalization with parameter sanitization in join workflows | **Verified** (`inviteCode.test.ts` passed) |

---

## 5. Verification Plan

- Run full Vitest regression suite (all 121 automated security and permission tests).
- Validate zero secrets in working directory via static pattern analysis.
- Verify TypeScript compilation and production build cleanly succeed.
