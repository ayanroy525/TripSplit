import { Pool } from "pg";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const rawConn = (
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.POSTGRESQL_URL ||
  ""
).replace(/\?.*$/, "");

export const pool = rawConn
  ? new Pool({
      connectionString: rawConn,
      ssl: { rejectUnauthorized: false },
      max: 6,
      min: 1,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    })
  : null;

// Keep-alive warm ping to prevent cold disconnects and TCP/TLS renegotiation overhead
if (pool) {
  setInterval(async () => {
    try {
      await pool.query("SELECT 1;");
    } catch {}
  }, 25000);
}

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

  // 1. Standard 3-part JWT: header.payload.signature
  if (parts.length === 3) {
    const [headerBase64, payloadBase64, signatureBase64] = parts;
    const signature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(`${headerBase64}.${payloadBase64}`)
      .digest("base64url");
    if (signature !== signatureBase64) return null;
    try {
      const payload: SessionPayload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
      const nowSec = Math.floor(Date.now() / 1000);
      // Support both second and millisecond timestamps
      const expVal = payload.exp > 1e11 ? payload.exp / 1000 : payload.exp;
      if (expVal && expVal < nowSec) return null;
      return payload;
    } catch {
      return null;
    }
  }

  // 2. Legacy 2-part token: data.signature
  if (parts.length === 2) {
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

  return null;
}

export function hashPasswordNode(password: string): string {
  try {
    return bcrypt.hashSync(password, 10);
  } catch {
    const salt = PASSWORD_SALT || "_tripsplit_salt_v1";
    return crypto.createHash("sha256").update(password + salt).digest("hex");
  }
}

export function verifyPasswordMatchNode(inputPassword: string, storedHashOrPassword?: string | null): boolean {
  if (!storedHashOrPassword || storedHashOrPassword.trim() === "" || !inputPassword) return false;

  // 1. Bcrypt hash check ($2a$, $2b$, $2y$)
  if (
    storedHashOrPassword.startsWith("$2a$") ||
    storedHashOrPassword.startsWith("$2b$") ||
    storedHashOrPassword.startsWith("$2y$")
  ) {
    try {
      return bcrypt.compareSync(inputPassword, storedHashOrPassword);
    } catch {
      return false;
    }
  }

  // 2. Exact match (legacy plain text migration fallback)
  if (storedHashOrPassword === inputPassword || storedHashOrPassword.trim() === inputPassword.trim()) return true;

  // 3. Salted SHA-256 with custom env salt
  if (PASSWORD_SALT) {
    const envSalted = crypto.createHash("sha256").update(inputPassword + PASSWORD_SALT).digest("hex");
    if (storedHashOrPassword === envSalted) return true;
  }

  // 4. Salted SHA-256 legacy default
  const legacySalted = crypto.createHash("sha256").update(inputPassword + "_tripsplit_salt_v1").digest("hex");
  if (storedHashOrPassword === legacySalted) return true;

  // 5. Unsalted SHA-256
  const unsalted = crypto.createHash("sha256").update(inputPassword).digest("hex");
  if (storedHashOrPassword === unsalted) return true;

  // 6. Simple hash
  let simpleHash = 0;
  for (let i = 0; i < inputPassword.length; i++) {
    simpleHash = ((simpleHash << 5) - simpleHash + inputPassword.charCodeAt(i)) | 0;
  }
  if (storedHashOrPassword === `fb_${Math.abs(simpleHash)}`) return true;

  return false;
}

export function setCorsHeaders(res: any, req?: any) {
  const origin = req?.headers?.origin || "";
  const isAllowed =
    !origin ||
    origin.includes("run.app") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("google.com");

  if (isAllowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin) {
    // Direct or server-side call
  } else {
    res.setHeader("Access-Control-Allow-Origin", "null");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token");
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

// In-memory fallback for serverless environments (Vercel/Cloudflare)
export interface LocalUserRecord {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  avatar_color: string;
  avatar_url?: string;
  bio?: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface LocalMemberRecord {
  id: string;
  trip_id: string;
  user_id?: string;
  name: string;
  email?: string;
  phone?: string;
  avatar_color?: string;
  role?: string;
  joined_at?: string;
}

export interface ServerStoreSchema {
  users: LocalUserRecord[];
  trips: any[];
  trip_members: LocalMemberRecord[];
  expenses: any[];
  payments: any[];
  activities: any[];
}

let inMemoryStore: ServerStoreSchema = {
  users: [],
  trips: [],
  trip_members: [],
  expenses: [],
  payments: [],
  activities: [],
};

function getStoragePath(): string | null {
  try {
    const candidate = path.resolve(process.cwd(), "data", "server_store.json");
    return candidate;
  } catch {
    return null;
  }
}

export function getLocalStore(): ServerStoreSchema {
  try {
    const filePath = getStoragePath();
    if (filePath && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        users: Array.isArray(parsed.users) ? parsed.users : inMemoryStore.users,
        trips: Array.isArray(parsed.trips) ? parsed.trips : inMemoryStore.trips,
        trip_members: Array.isArray(parsed.trip_members) ? parsed.trip_members : inMemoryStore.trip_members,
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : inMemoryStore.expenses,
        payments: Array.isArray(parsed.payments) ? parsed.payments : inMemoryStore.payments,
        activities: Array.isArray(parsed.activities) ? parsed.activities : inMemoryStore.activities,
      };
    }
  } catch {}
  return inMemoryStore;
}

export function saveLocalStore(data: ServerStoreSchema): void {
  inMemoryStore = data;
  try {
    const filePath = getStoragePath();
    if (filePath) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    }
  } catch {}
}

export function findLocalUser(identifier: string): LocalUserRecord | null {
  const store = getLocalStore();
  const trimmed = identifier.trim().toLowerCase();
  const cleanDigits = identifier.replace(/\D/g, "");

  let found = store.users.find(
    (u) =>
      (u.email && u.email.trim().toLowerCase() === trimmed) ||
      (u.name && u.name.trim().toLowerCase() === trimmed)
  );

  if (!found && cleanDigits.length >= 7) {
    found = store.users.find((u) => {
      const phoneDigits = (u.phone || "").replace(/\D/g, "");
      return phoneDigits.length >= 7 && (phoneDigits.endsWith(cleanDigits) || cleanDigits.endsWith(phoneDigits));
    });
  }

  return found || null;
}

export function findLocalMember(identifier: string): LocalMemberRecord | null {
  const store = getLocalStore();
  const trimmed = identifier.trim().toLowerCase();
  const cleanDigits = identifier.replace(/\D/g, "");

  let found = store.trip_members.find(
    (m) =>
      (m.email && m.email.trim().toLowerCase() === trimmed) ||
      (m.name && m.name.trim().toLowerCase() === trimmed)
  );

  if (!found && cleanDigits.length >= 7) {
    found = store.trip_members.find((m) => {
      const phoneDigits = (m.phone || "").replace(/\D/g, "");
      return phoneDigits.length >= 7 && (phoneDigits.endsWith(cleanDigits) || cleanDigits.endsWith(phoneDigits));
    });
  }

  return found || null;
}

export function saveLocalUser(user: LocalUserRecord): void {
  const store = getLocalStore();
  const idx = store.users.findIndex((u) => u.id === user.id);
  if (idx >= 0) store.users[idx] = user;
  else store.users.push(user);
  saveLocalStore(store);
}
