import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSessionToken, verifySessionToken, verifyPasswordMatchNode } from "../api/_shared";

describe("security hardening", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
    process.env.PASSWORD_SALT = "test-password-salt";
    process.env.NODE_ENV = "test";
  });

  it("accepts valid bcrypt hash", () => {
    const hash = bcrypt.hashSync("StrongPass123!", 10);
    expect(verifyPasswordMatchNode("StrongPass123!", hash)).toBe(true);
  });

  it("rejects plain-text legacy password fallback in production-safe mode", () => {
    process.env.NODE_ENV = "production";
    expect(verifyPasswordMatchNode("StrongPass123!", "StrongPass123!")).toBe(false);
  });

  it("rejects tampered session token", () => {
    const token = generateSessionToken("u_123", "test@example.com", "Tester");
    const tampered = token.slice(0, -1) + (token[token.length - 1] === "A" ? "B" : "A");
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects expired session token", () => {
    const payload = {
      userId: "u_123",
      email: "test@example.com",
      name: "Tester",
      exp: Date.now() - 1000,
    };
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto
      .createHmac("sha256", process.env.SESSION_SECRET || "test-session-secret")
      .update(data)
      .digest("base64url");

    expect(verifySessionToken(`${data}.${sig}`)).toBeNull();
  });
});
