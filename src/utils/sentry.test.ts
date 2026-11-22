import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCaptureException, mockFlush } = vi.hoisted(() => ({
  mockCaptureException: vi.fn().mockReturnValue("evt_id"),
  mockFlush: vi.fn().mockResolvedValue(true),
}));

vi.mock("@sentry/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/node")>();
  return {
    ...actual,
    captureException: mockCaptureException,
    flush: mockFlush,
  };
});

import { scrubSentryEvent, shouldIgnoreFrontendError } from "./sentry";
import { scrubServerSentryEvent, withSentry } from "../../api/_shared";

describe("Sentry Error Monitoring & PII Scrubbing", () => {
  describe("Frontend beforeSend scrubber & noisy error filter", () => {
    it("removes passwords, tokens, Authorization headers, cookies, phone numbers, emails, and request bodies", () => {
      const rawEvent: any = {
        message:
          "Auth error for alice@example.com phone +91 9876543210 Bearer secretToken123 password=MySecret123",
        user: {
          id: "u_123",
          email: "alice@example.com",
          username: "alice",
          ip_address: "203.0.113.10",
        },
        request: {
          url: "https://tripsplit.app/api/auth/login?token=abc123",
          headers: {
            Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxIn0.signature1234",
            Cookie: "tripsplit_session=supersecretcookie",
            "Content-Type": "application/json",
          },
          cookies: { tripsplit_session: "supersecretcookie" },
          data: { emailOrPhone: "alice@example.com", password: "SuperSecretPassword!" },
        },
        extra: {
          password: "SuperSecretPassword!",
          sessionToken: "tok_abc",
          nested: {
            phone: "+1-555-123-4567",
            safeField: "ok",
          },
        },
      };

      const cleaned = scrubSentryEvent(rawEvent);
      expect(cleaned).not.toBeNull();
      expect(cleaned!.user).toEqual({ id: "u_123" });
      expect(cleaned!.request?.data).toBeUndefined();
      expect(cleaned!.request?.cookies).toBeUndefined();
      expect(cleaned!.request?.headers?.Authorization).toBeUndefined();
      expect(cleaned!.request?.headers?.Cookie).toBeUndefined();
      expect(cleaned!.request?.headers?.["Content-Type"]).toBe("application/json");
      expect(cleaned!.message).not.toContain("alice@example.com");
      expect(cleaned!.message).not.toContain("9876543210");
      expect(cleaned!.message).not.toContain("secretToken123");
      expect(cleaned!.message).not.toContain("MySecret123");
      expect((cleaned!.extra as any).password).toBe("[REDACTED]");
      expect((cleaned!.extra as any).sessionToken).toBe("[REDACTED]");
      expect((cleaned!.extra as any).nested.phone).toBe("[REDACTED]");
      expect((cleaned!.extra as any).nested.safeField).toBe("ok");
    });

    it("ignores ResizeObserver loop errors, offline network errors, and cancelled requests", () => {
      expect(
        shouldIgnoreFrontendError({
          message: "ResizeObserver loop completed with undelivered notifications.",
        } as any)
      ).toBe(true);

      expect(
        shouldIgnoreFrontendError(
          { message: "TypeError: Failed to fetch" } as any,
          undefined,
          true
        )
      ).toBe(true);

      // Network error while online should NOT be ignored
      expect(
        shouldIgnoreFrontendError(
          { message: "TypeError: Failed to fetch" } as any,
          undefined,
          false
        )
      ).toBe(false);

      const abortErr = new Error("The user aborted a request.");
      abortErr.name = "AbortError";
      expect(
        shouldIgnoreFrontendError({} as any, { originalException: abortErr })
      ).toBe(true);
    });
  });

  describe("Server beforeSend scrubber & withSentry wrapper", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("strips request bodies, headers, cookies, passwords, tokens, and database error text on the server", () => {
      const rawServerEvent: any = {
        message: 'duplicate key value violates unique constraint "users_email_key"',
        user: {
          id: "u_456",
          email: "bob@example.com",
          ip_address: "198.51.100.1",
        },
        request: {
          url: "https://tripsplit.app/api/auth/login?secret=xyz",
          headers: { authorization: "Bearer abc", cookie: "tripsplit_session=abc" },
          cookies: { tripsplit_session: "abc" },
          data: { password: "secret" },
          query_string: "secret=xyz",
        },
        exception: {
          values: [
            {
              type: "Error",
              value: 'permission denied for table "trips" at postgres://user:pass@host/db',
            },
          ],
        },
      };

      const cleaned = scrubServerSentryEvent(rawServerEvent);
      expect(cleaned.user).toEqual({ id: "u_456" });
      expect(cleaned.request?.data).toBeUndefined();
      expect(cleaned.request?.headers).toBeUndefined();
      expect(cleaned.request?.cookies).toBeUndefined();
      expect(cleaned.request?.query_string).toBeUndefined();
      expect(cleaned.request?.url).toBe("https://tripsplit.app/api/auth/login");
      expect(cleaned.message).toBe("[REDACTED_DB_ERROR]");
      expect(cleaned.exception?.values?.[0]?.value).toBe("[REDACTED_DB_ERROR]");
    });

    it("captures unhandled errors and 5xx responses, flushes with 2000ms timeout, and ignores expected 4xx responses", async () => {
      mockCaptureException.mockClear();
      mockFlush.mockClear();

      const makeMockRes = () => {
        const res: any = {
          statusCode: 200,
          headersSent: false,
          writableEnded: false,
          body: "",
          setHeader: vi.fn(),
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(payload: unknown) {
            this.body = JSON.stringify(payload);
            this.writableEnded = true;
            return this;
          },
          end(payload?: string) {
            this.body = payload || "";
            this.writableEnded = true;
            return this;
          },
        };
        return res;
      };

      // 1. Expected 4xx statuses (400, 401, 403, 404, 429) must NOT be captured
      for (const status of [400, 401, 403, 404, 429]) {
        const handler4xx = withSentry(async (_req: any, res: any) => {
          res.statusCode = status;
          res.end(JSON.stringify({ success: false }));
        });
        await handler4xx({ method: "POST", url: "/api/test-4xx" }, makeMockRes());
      }
      expect(mockCaptureException).not.toHaveBeenCalled();

      // 2. 5xx response MUST be captured and flushed
      const handler500 = withSentry(async (_req: any, res: any) => {
        res.statusCode = 503;
        res.end(JSON.stringify({ success: false, error: "Database unavailable" }));
      });
      await handler500({ method: "GET", url: "/api/test-503" }, makeMockRes());
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockFlush).toHaveBeenCalledWith(2000);

      // 3. Unhandled exception MUST be captured, sanitized, return 500, and flush
      mockCaptureException.mockClear();
      mockFlush.mockClear();
      const throwingHandler = withSentry(async (_req: any, _res: any) => {
        const dbErr: any = new Error('relation "public.users" does not exist');
        dbErr.code = "42P01";
        dbErr.severity = "ERROR";
        throw dbErr;
      });
      const resThrow = makeMockRes();
      await throwingHandler({ method: "POST", url: "/api/test-throw" }, resThrow);
      expect(resThrow.statusCode).toBe(500);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const capturedArg = mockCaptureException.mock.calls[0][0] as Error;
      expect(capturedArg.message).toBe("Database operation failed");
      expect(mockFlush).toHaveBeenCalledWith(2000);
    });
  });
});
