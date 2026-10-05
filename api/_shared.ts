import { Pool } from "pg";
import crypto from "crypto";

const rawConn = (
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  "postgres://postgres.ryamchjjwoaimwrmurry:362hfgGiqrIRgUH6@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
).replace(/\?.*$/, "");

export const pool = rawConn
  ? new Pool({
      connectionString: rawConn,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
    })
  : null;

export const PASSWORD_SALT = process.env.PASSWORD_SALT || process.env.AUTH_SECRET || "";
export const SESSION_SECRET = process.env.SESSION_SECRET || process.env.AUTH_SECRET || "tripsplit_session_secret_dev";

export interface SessionPayload {
  userId: string;
  email?: string;
  name?: string;
  exp: number;
}

export function generateSessionToken(userId: string, email?: string, name?: string): string {
  const payload: SessionPayload = {
    userId,
    email,
    name,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPasswordNode(password: string): string {
  const salt = PASSWORD_SALT || "_tripsplit_salt_v1";
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

export function verifyPasswordMatchNode(inputPassword: string, storedHashOrPassword?: string | null): boolean {
  if (!storedHashOrPassword || storedHashOrPassword.trim() === "") return true;
  if (storedHashOrPassword === inputPassword || storedHashOrPassword.trim() === inputPassword.trim()) return true;

  if (PASSWORD_SALT) {
    const envSalted = crypto.createHash("sha256").update(inputPassword + PASSWORD_SALT).digest("hex");
    if (storedHashOrPassword === envSalted) return true;
  }

  const legacySalted = crypto.createHash("sha256").update(inputPassword + "_tripsplit_salt_v1").digest("hex");
  if (storedHashOrPassword === legacySalted) return true;

  const unsalted = crypto.createHash("sha256").update(inputPassword).digest("hex");
  if (storedHashOrPassword === unsalted) return true;

  let simpleHash = 0;
  for (let i = 0; i < inputPassword.length; i++) {
    simpleHash = ((simpleHash << 5) - simpleHash + inputPassword.charCodeAt(i)) | 0;
  }
  if (storedHashOrPassword === `fb_${Math.abs(simpleHash)}`) return true;

  return false;
}

export function setCorsHeaders(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
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

export function sendJson(res: any, statusCode: number, data: any) {
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  if (typeof res.status === "function") {
    res.status(statusCode).json(data);
  } else {
    res.statusCode = statusCode;
    res.end(JSON.stringify(data));
  }
}
