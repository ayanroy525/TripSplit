# TripSplit — Group Travel Expense Splitter

TripSplit is a React 19 + Vite + TypeScript Progressive Web App backed by Vercel serverless API functions (`/api`) and Supabase PostgreSQL.

## Local Development

```bash
npm install
npm run dev
```

Run the test suite:

```bash
npm test
```

Build for production:

```bash
npm run build
```

---

## Sentry Error Monitoring Setup

TripSplit uses `@sentry/react` on the frontend, `@sentry/node` on Vercel `/api` serverless functions, and `@sentry/vite-plugin` at build time for hidden source maps.

### 1. Environment Variables

Configure these environment variables in your Vercel project settings (and locally if testing production builds):

| Variable | Scope | Secret? | Description |
| --- | --- | --- | --- |
| `VITE_SENTRY_DSN` | Frontend (Build / Browser) | No | Public Sentry DSN for browser error reporting. Only activates when `import.meta.env.MODE === "production"`. |
| `VITE_APP_VERSION` | Frontend & Build | No | Release tag (for example `tripsplit@1.0.0` or commit SHA) attached to Sentry events and uploaded source maps. |
| `SENTRY_DSN` | Backend (`/api` Runtime) | Server-only | Sentry DSN used by Vercel serverless functions via `api/_shared.ts`. |
| `SENTRY_AUTH_TOKEN` | **Build-only** | **Yes (Secret)** | Sentry auth token with `project:releases` and `org:read` scopes for uploading hidden source maps during `vite build`. **Never prefix with `VITE_` and never expose to browser code.** |
| `SENTRY_ORG` | Build-only | No | Your Sentry organization slug. |
| `SENTRY_PROJECT` | Build-only | No | Your Sentry project slug. |

### 2. Source Maps & Deployment Hygiene

- `vite.config.ts` sets `build.sourcemap = "hidden"` so browsers never receive `//# sourceMappingURL` references.
- When `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are present during `npm run build`, `@sentry/vite-plugin` uploads source maps to Sentry and deletes `./dist/**/*.map` automatically via `filesToDeleteAfterUpload`.
- If `SENTRY_AUTH_TOKEN` is absent during a build, a cleanup plugin still removes all `.map` files from `dist/` so source maps are never published.

### 3. Content Security Policy (CSP)

`vercel.json` includes the Sentry SaaS ingest domains in `connect-src`:

```
https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io
```

If you use a self-hosted Sentry instance or a custom ingest domain, add that origin to `connect-src` in `vercel.json`.

### 4. What Data Is and Is Not Sent

**Sent to Sentry:**
- Unhandled JavaScript exceptions, React render crashes (captured by `Sentry.ErrorBoundary`), and unexpected `5xx` server errors/responses from `/api/*`.
- Release version (`VITE_APP_VERSION`), environment (`production`), and sampled performance traces (`tracesSampleRate: 0.1`).
- Error-triggered Session Replays (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0.1`) with **`maskAllText: true`** and **`blockAllMedia: true`** so no user text or uploaded receipt images are recorded.
- Anonymous user identifier only (`Sentry.setUser({ id })`) while signed in, cleared immediately on logout.
- Non-PII operational tags: `trip_id` (current active trip ID or `"none"`), `network_state` (`"online"` or `"offline"`), `http.method`, `http.status_code`, and sanitized `api.route`.

**Never Sent to Sentry (Scrubbed / Ignored):**
- Default PII collection is explicitly disabled on both frontend and backend via Sentry v11 `dataCollection` (`userInfo: false`, `cookies: false`, `httpHeaders: false`, `httpBodies: []`, `urlQueryParams: false`, `databaseQueryData: false`, `stackFrameVariables: false`).
- User emails, phone numbers, names, and IP addresses are never attached to `Sentry.setUser` and are scrubbed by `beforeSend`.
- Passwords, session tokens, JWTs, `Authorization` headers, cookies, API keys, and request bodies are stripped by `beforeSend`.
- Raw PostgreSQL / SQL database error text and connection strings are redacted on the server before reaching Sentry.
- Expected `4xx` HTTP responses (`400`, `401`, `403`, `404`, `429`) are **not** reported by `withSentry`.
- Noisy client errors (`ResizeObserver loop`, network errors while offline, and aborted/cancelled requests) are dropped in `beforeSend`.

### 5. Triggering a Test Error & Removing the Test Button

To verify Sentry in production:

1. Deploy with `VITE_SENTRY_DSN` and `SENTRY_DSN` set in Vercel.
2. Sign in as the administrator and open **System Diagnostics & Database Health** (`SystemHealthModal`).
3. Click the **Test Sentry** button in the modal toolbar. This calls `reportError(new Error("TripSplit Sentry test error (manual verification)"))`.
4. Confirm the event appears in your Sentry project with `trip_id`, `network_state`, and `{ id }` user context (and no email, phone, or cookies).

**To remove the test button after verification:**
- Open `src/components/SystemHealthModal.tsx` and delete the two blocks wrapped in `// SENTRY-TEST-BUTTON-START` ... `// SENTRY-TEST-BUTTON-END` (the `reportError` import at the top and the `<button>` block in the toolbar).
