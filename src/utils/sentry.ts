import React from "react";
import * as Sentry from "@sentry/react";

const SENSITIVE_KEY_PATTERN =
  /pass(word|wd)?|pwd|secret|token|auth(orization)?|cookie|jwt|session|phone|mobile|tel|email|mail|body|payload|credential|api[-_]?key/i;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PHONE_PATTERN = /(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}(?!\w)/g;
const KV_SECRET_PATTERN =
  /\b(password|passwd|pwd|token|secret|authorization|cookie)\s*[:=]\s*[^\s,&;"']+/gi;

const NOISY_ERROR_PATTERNS = [
  /ResizeObserver loop limit exceeded/i,
  /ResizeObserver loop completed with undelivered notifications/i,
  /\bAbortError\b/i,
  /The user aborted a request/i,
  /signal is aborted/i,
  /request\s*(was\s*)?cancell?ed/i,
  /cancell?ed\s*request/i,
];

const NETWORK_ERROR_PATTERNS = [
  /Failed to fetch/i,
  /NetworkError when attempting to fetch resource/i,
  /Load failed/i,
  /Network request failed/i,
  /ERR_INTERNET_DISCONNECTED/i,
  /ERR_NETWORK_CHANGED/i,
];

let frontendSentryInitialized = false;

export function scrubString(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(KV_SECRET_PATTERN, "$1=[REDACTED]")
    .replace(PHONE_PATTERN, (match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15 ? "[REDACTED_PHONE]" : match;
    });
}

export function scrubUnknown(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrubUnknown(item, depth + 1));
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      scrubbed[key] = "[REDACTED]";
    } else {
      scrubbed[key] = scrubUnknown(val, depth + 1);
    }
  }
  return scrubbed;
}

function extractEventErrorMessages(event: Sentry.ErrorEvent, hint?: Sentry.EventHint): string[] {
  const messages: string[] = [];

  if (typeof event.message === "string") {
    messages.push(event.message);
  }
  if (typeof event.logentry?.message === "string") {
    messages.push(event.logentry.message);
  }
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.type) messages.push(ex.type);
      if (ex.value) messages.push(ex.value);
    }
  }
  const orig = hint?.originalException;
  if (orig instanceof Error) {
    if (orig.name) messages.push(orig.name);
    if (orig.message) messages.push(orig.message);
  } else if (typeof orig === "string") {
    messages.push(orig);
  }

  return messages;
}

export function shouldIgnoreFrontendError(
  event: Sentry.ErrorEvent,
  hint?: Sentry.EventHint,
  isOffline: boolean = typeof navigator !== "undefined" && navigator.onLine === false
): boolean {
  const messages = extractEventErrorMessages(event, hint);
  const combined = messages.join(" ");

  if (NOISY_ERROR_PATTERNS.some((pattern) => pattern.test(combined))) {
    return true;
  }

  if (isOffline && NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(combined))) {
    return true;
  }

  const orig = hint?.originalException as { name?: string; code?: string } | undefined;
  if (orig && (orig.name === "AbortError" || orig.code === "ERR_CANCELED")) {
    return true;
  }

  return false;
}

export function scrubSentryEvent(
  event: Sentry.ErrorEvent,
  hint?: Sentry.EventHint
): Sentry.ErrorEvent | null {
  if (shouldIgnoreFrontendError(event, hint)) {
    return null;
  }

  // Strip request body, cookies, and sensitive headers
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      const cleanHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(event.request.headers)) {
        if (!SENSITIVE_KEY_PATTERN.test(k)) {
          cleanHeaders[k] = typeof v === "string" ? scrubString(v) : String(v);
        }
      }
      event.request.headers = cleanHeaders;
    }
    if (typeof event.request.url === "string") {
      event.request.url = scrubString(event.request.url);
    }
    if (typeof event.request.query_string === "string") {
      event.request.query_string = scrubString(event.request.query_string);
    } else if (event.request.query_string && typeof event.request.query_string === "object") {
      event.request.query_string = scrubUnknown(event.request.query_string) as any;
    }
  }

  // Restrict user context strictly to user id (no email, phone, name, or IP)
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  }

  if (typeof event.message === "string") {
    event.message = scrubString(event.message);
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((ex) => ({
      ...ex,
      value: typeof ex.value === "string" ? scrubString(ex.value) : ex.value,
    }));
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: typeof crumb.message === "string" ? scrubString(crumb.message) : crumb.message,
      data: crumb.data ? (scrubUnknown(crumb.data) as Record<string, unknown>) : undefined,
    }));
  }

  if (event.extra) {
    event.extra = scrubUnknown(event.extra) as Record<string, unknown>;
  }

  if (event.contexts) {
    event.contexts = scrubUnknown(event.contexts) as NonNullable<Sentry.ErrorEvent["contexts"]>;
  }

  return event;
}

export function initSentry(): boolean {
  if (frontendSentryInitialized) return true;

  const dsn = (import.meta.env.VITE_SENTRY_DSN || "").trim();
  const mode = import.meta.env.MODE;
  const isProd = mode === "production";

  if (!dsn || !isProd) {
    return false;
  }

  const release = (import.meta.env.VITE_APP_VERSION || "").trim() || undefined;

  Sentry.init({
    dsn,
    environment: mode,
    release,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event, hint) {
      return scrubSentryEvent(event, hint);
    },
  });

  if (typeof navigator !== "undefined") {
    Sentry.setTag("network_state", navigator.onLine ? "online" : "offline");
  }

  frontendSentryInitialized = true;
  return true;
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(scrubUnknown(context) as Record<string, unknown>);
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

export function setSentryUser(userId: string | null | undefined): void {
  if (userId && String(userId).trim()) {
    Sentry.setUser({ id: String(userId).trim() });
  } else {
    Sentry.setUser(null);
  }
}

export function setSentryTripTag(tripId: string | null | undefined): void {
  Sentry.setTag("trip_id", tripId && String(tripId).trim() ? String(tripId).trim() : "none");
}

export function setSentryNetworkTag(isOnline: boolean): void {
  Sentry.setTag("network_state", isOnline ? "online" : "offline");
}

export function SentryErrorFallback(): React.ReactElement {
  return React.createElement(
    "div",
    {
      role: "alert",
      className:
        "min-h-screen bg-[#0F172A] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center",
    },
    React.createElement(
      "div",
      {
        className:
          "max-w-sm w-full bg-[#1E293B] border border-[#334155] rounded-2xl p-6 shadow-xl space-y-4",
      },
      React.createElement(
        "h1",
        { className: "text-lg font-bold text-slate-100" },
        "Something went wrong"
      ),
      React.createElement(
        "p",
        { className: "text-sm text-slate-400" },
        "An unexpected issue interrupted TripSplit. Reload the page to continue where you left off."
      ),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          },
          className:
            "w-full py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer",
        },
        "Reload"
      )
    )
  );
}

export function SentryErrorBoundary({ children }: { children: React.ReactNode }): React.ReactElement {
  return React.createElement(
    Sentry.ErrorBoundary,
    { fallback: () => React.createElement(SentryErrorFallback) },
    children
  );
}
