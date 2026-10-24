process.env.DISABLE_HMR = "true";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import crypto from "crypto";
import {
  getLocalStore,
  saveLocalStore,
  findLocalUser,
  findLocalMember,
  saveLocalUser,
  getFullTripsForUser,
  LocalUserRecord,
} from "./src/serverDb.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const rawConn = (
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  ""
).replace(/\?.*$/, "");

const pool = rawConn
  ? new Pool({
      connectionString: rawConn,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000,
    })
  : null;

const PASSWORD_SALT = process.env.PASSWORD_SALT || process.env.AUTH_SECRET || "";
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.AUTH_SECRET || "tripsplit_session_secret_dev";

interface SessionPayload {
  userId: string;
  email?: string;
  name?: string;
  iat: number;
  exp: number;
}

function generateSessionToken(userId: string, email?: string, name?: string): string {
  const payload: SessionPayload = {
    userId,
    email,
    name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };

  const headerBase64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`${headerBase64}.${payloadBase64}`)
    .digest("base64url");

  return `${headerBase64}.${payloadBase64}.${signature}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [headerBase64, payloadBase64, signatureBase64] = token.split(".");
    if (!headerBase64 || !payloadBase64 || !signatureBase64) return null;

    const signature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(`${headerBase64}.${payloadBase64}`)
      .digest("base64url");

    if (signature !== signatureBase64) return null;

    const payload: SessionPayload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

interface AuthRequest extends Request {
  userId?: string;
  session?: SessionPayload;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({ success: false, error: "Authorization token required" });
  }

  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }

  req.userId = session.userId;
  req.session = session;
  next();
}

interface TripAuthCheck {
  isOwner: boolean;
  isMember: boolean;
  canAccess: boolean;
  role?: string;
}

async function checkTripAuthorization(tripId: string, userId: string | undefined, poolInstance: Pool | null): Promise<TripAuthCheck> {
  if (!tripId || !userId) {
    return { isOwner: false, isMember: false, canAccess: false };
  }

  if (poolInstance) {
    try {
      const tripRes = await poolInstance.query("SELECT owner_id FROM public.trips WHERE id = $1 LIMIT 1;", [tripId]);
      const trip = tripRes.rows[0];
      if (trip) {
        const isOwner = trip.owner_id === userId;
        if (isOwner) {
          return { isOwner: true, isMember: true, canAccess: true, role: "owner" };
        }

        const memberRes = await poolInstance.query(
          `SELECT tm.role FROM public.trip_members tm
           LEFT JOIN public.users u ON u.id = $2
           WHERE tm.trip_id = $1 AND (
             tm.user_id = $2
             OR tm.id = $2
             OR (u.email IS NOT NULL AND u.email <> '' AND LOWER(TRIM(tm.email)) = LOWER(TRIM(u.email)))
             OR (u.phone IS NOT NULL AND LENGTH(regexp_replace(u.phone, '\\D', '', 'g')) >= 7
                 AND regexp_replace(COALESCE(tm.phone, ''), '\\D', '', 'g') LIKE '%' || regexp_replace(u.phone, '\\D', '', 'g') || '%')
           )
           LIMIT 1;`,
          [tripId, userId]
        );

        const member = memberRes.rows[0];
        if (member) {
          return { isOwner: false, isMember: true, canAccess: true, role: member.role || "member" };
        }

        return { isOwner: false, isMember: false, canAccess: false };
      }
    } catch (err) {
      console.warn("Notice checking trip authorization in PostgreSQL:", err);
    }
  }

  // Local store fallback
  const store = getLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) {
    return { isOwner: false, isMember: false, canAccess: false };
  }
  const isOwner = trip.owner_id === userId;
  if (isOwner) {
    return { isOwner: true, isMember: true, canAccess: true, role: "owner" };
  }
  const member = store.trip_members.find((m) => m.trip_id === tripId && (m.user_id === userId || m.id === userId));
  if (member) {
    return { isOwner: false, isMember: true, canAccess: true, role: member.role || "member" };
  }

  return { isOwner: false, isMember: false, canAccess: false };
}

function hashPasswordNode(password: string): string {
  const salt = PASSWORD_SALT || "_tripsplit_salt_v1";
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

function verifyPasswordMatchNode(inputPassword: string, storedHashOrPassword?: string | null): boolean {
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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/db/status", async (_req, res) => {
  if (!pool) {
    const localStore = getLocalStore();
    return res.json({
      connected: false,
      mode: "local_storage",
      message: "PostgreSQL is not configured. Using persistent local server storage.",
      tables: {
        users: localStore.users.length,
        trips: localStore.trips.length,
        trip_members: localStore.trip_members.length,
        expenses: localStore.expenses.length,
        payments: localStore.payments.length,
        activities: localStore.activities.length,
      },
      checkedAt: new Date().toISOString(),
    });
  }

  const start = Date.now();
  try {
    const verRes = await pool.query("SELECT version();");
    const latencyMs = Date.now() - start;

    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tableCounts: Record<string, number> = {};
    for (const row of tablesRes.rows) {
      try {
        const countRes = await pool.query(`SELECT COUNT(*) FROM "${row.table_name}";`);
        tableCounts[row.table_name] = parseInt(countRes.rows[0].count, 10);
      } catch {
        tableCounts[row.table_name] = -1;
      }
    }

    return res.json({
      connected: true,
      latencyMs,
      version: verRes.rows[0]?.version,
      tables: tableCounts,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const localStore = getLocalStore();
    return res.json({
      connected: false,
      mode: "local_storage_fallback",
      error: err?.message || "PostgreSQL connection error",
      tables: {
        users: localStore.users.length,
        trips: localStore.trips.length,
      },
      checkedAt: new Date().toISOString(),
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { emailOrPhone, password } = req.body || {};
  const rawInput = (emailOrPhone || "").trim();
  const inputPassword = password || "";

  if (!rawInput) {
    return res.status(400).json({ success: false, error: "Please enter your email or phone number." });
  }
  if (!inputPassword) {
    return res.status(400).json({ success: false, error: "Please enter your password." });
  }

  const cleanDigits = rawInput.replace(/\D/g, "");
  const trimmedLower = rawInput.toLowerCase();

  let foundUser: any = null;
  let usedPostgres = false;

  // 1. Try PostgreSQL if pool is initialized
  if (pool) {
    try {
      const usersQuery = `
        SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, created_at
        FROM public.users
        WHERE LOWER(TRIM(COALESCE(email, ''))) = $1
           OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%')
           OR LOWER(TRIM(COALESCE(name, ''))) = $1
        LIMIT 1;
      `;
      const userRes = await pool.query(usersQuery, [trimmedLower, cleanDigits.length >= 7 ? cleanDigits : ""]);
      foundUser = userRes.rows[0];

      if (!foundUser && cleanDigits.length >= 7) {
        const allUsersRes = await pool.query(
          "SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, created_at FROM public.users LIMIT 200;"
        );
        foundUser = allUsersRes.rows.find((u) => {
          const uPhone = (u.phone || "").replace(/\D/g, "");
          return uPhone.length >= 7 && (uPhone.endsWith(cleanDigits) || cleanDigits.endsWith(uPhone));
        });
      }

      if (!foundUser) {
        try {
          const memberRes = await pool.query(
            `SELECT id, user_id, name, email, phone, avatar_color, joined_at
             FROM public.trip_members
             WHERE LOWER(TRIM(COALESCE(email, ''))) = $1
                OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%')
             LIMIT 1;`,
            [trimmedLower, cleanDigits.length >= 7 ? cleanDigits : ""]
          );
          const foundMember = memberRes.rows[0];
          if (foundMember) {
            const newUserId = foundMember.user_id || foundMember.id || `u_${Date.now()}`;
            const newHashed = hashPasswordNode(inputPassword);
            await pool.query(
              `INSERT INTO public.users (id, email, name, phone, avatar_color, password_hash, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
               ON CONFLICT (id) DO UPDATE SET password_hash = $6;`,
              [
                newUserId,
                foundMember.email || (trimmedLower.includes("@") ? trimmedLower : null),
                foundMember.name || "Traveler",
                foundMember.phone || (cleanDigits.length >= 7 ? rawInput : null),
                foundMember.avatar_color || "#E39A2D",
                newHashed,
              ]
            );

            const sessionToken = generateSessionToken(newUserId, foundMember.email, foundMember.name);
            return res.json({
              success: true,
              token: sessionToken,
              user: {
                id: newUserId,
                name: foundMember.name || "Traveler",
                email: foundMember.email || (trimmedLower.includes("@") ? trimmedLower : ""),
                phone: foundMember.phone || undefined,
                avatarColor: foundMember.avatar_color || "#E39A2D",
                bio: "Travel Enthusiast",
                createdAt: foundMember.joined_at || new Date().toISOString(),
              },
            });
          }
        } catch (e) {
          console.warn("Notice querying trip_members in pool:", e);
        }
      }

      usedPostgres = true;
    } catch (dbErr: any) {
      console.warn("Notice: PostgreSQL unavailable during login, switching to server local storage:", dbErr?.message || dbErr);
    }
  }

  // 2. Local Server Store Fallback
  if (!foundUser) {
    const localUser = findLocalUser(rawInput);
    if (localUser) {
      foundUser = localUser;
    } else {
      const localMember = findLocalMember(rawInput);
      if (localMember) {
        const newUserId = localMember.user_id || localMember.id || `u_${Date.now()}`;
        const newHashed = hashPasswordNode(inputPassword);
        const createdUser: LocalUserRecord = {
          id: newUserId,
          email: localMember.email || (trimmedLower.includes("@") ? trimmedLower : null),
          name: localMember.name || "Traveler",
          phone: localMember.phone || (cleanDigits.length >= 7 ? rawInput : null),
          avatar_color: localMember.avatar_color || "#E39A2D",
          bio: "Travel Enthusiast",
          password_hash: newHashed,
          created_at: localMember.joined_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        saveLocalUser(createdUser);
        const sessionToken = generateSessionToken(newUserId, createdUser.email || undefined, createdUser.name);
        return res.json({
          success: true,
          token: sessionToken,
          user: {
            id: newUserId,
            name: createdUser.name,
            email: createdUser.email || "",
            phone: createdUser.phone || undefined,
            avatarColor: createdUser.avatar_color,
            bio: createdUser.bio,
            createdAt: createdUser.created_at,
          },
        });
      }
    }
  }

  if (!foundUser) {
    return res.status(404).json({
      success: false,
      error: "No account found matching this email or phone number. Please check your credentials or click 'Create Account' to sign up.",
    });
  }

  const isPassValid = verifyPasswordMatchNode(inputPassword, foundUser.password_hash);
  if (!isPassValid) {
    return res.status(401).json({
      success: false,
      error: "Incorrect password for this account. Please verify your password or use 'Forgot Password?' to reset it.",
    });
  }

  const modernHash = hashPasswordNode(inputPassword);
  if (foundUser.password_hash !== modernHash) {
    if (usedPostgres && pool) {
      try {
        await pool.query("UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2;", [
          modernHash,
          foundUser.id,
        ]);
      } catch (e) {}
    }
    foundUser.password_hash = modernHash;
    saveLocalUser(foundUser);
  }

  const userAccount = {
    id: foundUser.id,
    name: foundUser.name || (foundUser.email ? foundUser.email.split("@")[0] : "Traveler"),
    email: foundUser.email || (trimmedLower.includes("@") ? trimmedLower : ""),
    phone: foundUser.phone || undefined,
    avatarColor: foundUser.avatar_color || "#E39A2D",
    avatarUrl: foundUser.avatar_url || undefined,
    bio: foundUser.bio || "Travel Enthusiast",
    createdAt: foundUser.created_at || new Date().toISOString(),
  };

  const sessionToken = generateSessionToken(foundUser.id, foundUser.email, foundUser.name);
  return res.json({ success: true, token: sessionToken, user: userAccount });
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, phone, password, avatarColor, bio } = req.body || {};
  const trimmedName = (name || "").trim();
  const trimmedEmail = (email || "").trim().toLowerCase();
  const rawPhone = (phone || "").trim();
  const cleanDigits = rawPhone.replace(/\D/g, "");
  const inputPassword = password || "";

  if (!trimmedName) {
    return res.status(400).json({ success: false, error: "Please enter your full name." });
  }
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return res.status(400).json({ success: false, error: "Please enter a valid email address." });
  }
  if (!inputPassword || inputPassword.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
  }

  // Check if account already exists in local store
  const existingLocal = findLocalUser(trimmedEmail) || (cleanDigits.length >= 7 ? findLocalUser(cleanDigits) : null);
  if (existingLocal) {
    return res.status(409).json({
      success: false,
      error: "An account with this email or phone already exists. Please log in with your password.",
    });
  }

  if (pool) {
    try {
      const existingRes = await pool.query(
        `SELECT id, email, phone FROM public.users
         WHERE LOWER(TRIM(email)) = $1
            OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
         LIMIT 1;`,
        [trimmedEmail, cleanDigits.length >= 7 ? cleanDigits : ""]
      );

      if (existingRes.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "An account with this email or phone already exists. Please log in with your password.",
        });
      }
    } catch (err) {
      console.warn("Notice: PostgreSQL check during signup:", err);
    }
  }

  const userId = `u_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  const hashedPassword = hashPasswordNode(inputPassword);

  const localUserRecord: LocalUserRecord = {
    id: userId,
    email: trimmedEmail,
    name: trimmedName,
    phone: rawPhone || null,
    avatar_color: avatarColor || "#E39A2D",
    bio: bio || "Travel Enthusiast",
    password_hash: hashedPassword,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveLocalUser(localUserRecord);

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO public.users (id, email, name, phone, avatar_color, bio, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW());`,
        [
          userId,
          trimmedEmail,
          trimmedName,
          rawPhone || null,
          avatarColor || "#E39A2D",
          bio || "Travel Enthusiast",
          hashedPassword,
        ]
      );
    } catch (err) {
      console.warn("Notice: PostgreSQL insert during signup deferred:", err);
    }
  }

  const userAccount = {
    id: userId,
    name: trimmedName,
    email: trimmedEmail,
    phone: rawPhone || undefined,
    avatarColor: avatarColor || "#E39A2D",
    bio: bio || "Travel Enthusiast",
    createdAt: localUserRecord.created_at,
  };

  const sessionToken = generateSessionToken(userId, trimmedEmail, trimmedName);
  return res.json({ success: true, token: sessionToken, user: userAccount });
});

app.get("/api/trips/invite/:code", async (req, res) => {
  const code = (req.params.code || "").trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ success: false, message: "Code is required" });
  }

  if (pool) {
    try {
      const dbRes = await pool.query("SELECT public.get_trip_by_invite_code($1) AS res;", [code]);
      const payload = dbRes.rows[0]?.res;
      if (payload && payload.success) {
        return res.json(payload);
      }
    } catch (err: any) {
      console.warn("Notice: PostgreSQL invite query:", err?.message || err);
    }
  }

  const store = getLocalStore();
  const trip = store.trips.find((t) => t.invite_code === code);
  if (!trip) {
    return res.status(404).json({ success: false, message: "Invite code is invalid or expired." });
  }

  return res.json({
    success: true,
    trip: {
      id: trip.id,
      name: trip.name,
      description: trip.description,
      currency: trip.currency,
      memberCount: store.trip_members.filter((m) => m.trip_id === trip.id).length,
    },
  });
});

app.post("/api/trips/join", authMiddleware, async (req: AuthRequest, res) => {
  const { inviteCode, user } = req.body || {};
  const code = (inviteCode || "").trim().toUpperCase();

  if (!code || !user || !user.id) {
    return res.status(400).json({ success: false, message: "Invite code and user are required" });
  }

  if (user.id !== req.userId) {
    return res.status(403).json({ success: false, message: "Cannot join trip as another user" });
  }

  if (pool) {
    try {
      const dbRes = await pool.query("SELECT public.join_trip_by_invite_code($1, $2::jsonb) AS res;", [
        code,
        JSON.stringify(user),
      ]);
      const payload = dbRes.rows[0]?.res;
      if (payload && payload.success) {
        return res.json(payload);
      }
    } catch (err: any) {
      console.warn("Notice: PostgreSQL join trip:", err?.message || err);
    }
  }

  const store = getLocalStore();
  const trip = store.trips.find((t) => t.invite_code === code);
  if (!trip) {
    return res.status(404).json({ success: false, message: "Invite code is invalid or expired." });
  }

  const alreadyMember = store.trip_members.some((m) => m.trip_id === trip.id && (m.user_id === user.id || m.id === user.id));
  if (!alreadyMember) {
    store.trip_members.push({
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      trip_id: trip.id,
      user_id: user.id,
      name: user.name || "Member",
      email: user.email || undefined,
      phone: user.phone || undefined,
      avatar_color: user.avatarColor || "#E39A2D",
      role: "member",
      joined_at: new Date().toISOString(),
    });
    saveLocalStore(store);
  }

  return res.json({ success: true, tripId: trip.id, message: "Joined trip successfully!" });
});

app.get("/api/user-trips", authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  if (pool) {
    try {
      const tripsQuery = `
        SELECT DISTINCT t.*
        FROM public.trips t
        LEFT JOIN public.trip_members tm ON tm.trip_id = t.id
        LEFT JOIN public.users u ON u.id = $1
        WHERE t.owner_id = $1
           OR t.member_user_ids @> to_jsonb($1::text)
           OR tm.user_id = $1
           OR tm.id = $1
           OR (u.email IS NOT NULL AND u.email <> '' AND LOWER(TRIM(tm.email)) = LOWER(TRIM(u.email)))
           OR (u.phone IS NOT NULL AND LENGTH(regexp_replace(u.phone, '\\D', '', 'g')) >= 7
               AND regexp_replace(COALESCE(tm.phone, ''), '\\D', '', 'g') LIKE '%' || regexp_replace(u.phone, '\\D', '', 'g') || '%')
        ORDER BY t.created_at DESC;
      `;
      const tripsRes = await pool.query(tripsQuery, [userId]);
      const trips = tripsRes.rows;

      const fullTrips = [];
      for (const trip of trips) {
        const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
          pool.query("SELECT * FROM public.trip_members WHERE trip_id = $1 ORDER BY joined_at ASC;", [trip.id]),
          pool.query("SELECT * FROM public.expenses WHERE trip_id = $1 AND COALESCE(deleted, false) = false ORDER BY created_at DESC;", [trip.id]),
          pool.query("SELECT * FROM public.payments WHERE trip_id = $1 ORDER BY created_at DESC;", [trip.id]),
          pool.query("SELECT * FROM public.activities WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 50;", [trip.id]),
        ]);

        fullTrips.push({
          ...trip,
          members: membersRes.rows,
          expenses: expensesRes.rows,
          payments: paymentsRes.rows,
          activities: activitiesRes.rows,
        });
      }

      return res.json({ success: true, trips: fullTrips });
    } catch (err: any) {
      console.warn("Notice: PostgreSQL in user-trips, using local server store:", err?.message || err);
    }
  }

  const userTrips = getFullTripsForUser(userId);
  return res.json({ success: true, trips: userTrips });
});

app.get("/api/trips/:tripId", authMiddleware, async (req: AuthRequest, res) => {
  const tripId = (req.params.tripId || "").trim();
  const userId = req.userId;

  if (!tripId) {
    return res.status(400).json({ success: false, error: "tripId is required" });
  }

  const authCheck = await checkTripAuthorization(tripId, userId, pool);
  if (!authCheck.canAccess) {
    return res.status(403).json({ success: false, error: "Access denied. You are not a member of this trip." });
  }

  if (pool) {
    try {
      const tripRes = await pool.query("SELECT * FROM public.trips WHERE id = $1 LIMIT 1;", [tripId]);
      const trip = tripRes.rows[0];
      if (trip) {
        const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
          pool.query("SELECT * FROM public.trip_members WHERE trip_id = $1 ORDER BY joined_at ASC;", [trip.id]),
          pool.query("SELECT * FROM public.expenses WHERE trip_id = $1 AND COALESCE(deleted, false) = false ORDER BY created_at DESC;", [trip.id]),
          pool.query("SELECT * FROM public.payments WHERE trip_id = $1 ORDER BY created_at DESC;", [trip.id]),
          pool.query("SELECT * FROM public.activities WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 50;", [trip.id]),
        ]);

        return res.json({
          success: true,
          trip: {
            ...trip,
            members: membersRes.rows,
            expenses: expensesRes.rows,
            payments: paymentsRes.rows,
            activities: activitiesRes.rows,
          },
        });
      }
    } catch (err: any) {
      console.warn("Notice: PostgreSQL in trip detail, using local server store:", err?.message || err);
    }
  }

  const store = getLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) {
    return res.status(404).json({ success: false, error: "Trip not found" });
  }

  return res.json({
    success: true,
    trip: {
      ...trip,
      members: store.trip_members.filter((m) => m.trip_id === trip.id),
      expenses: store.expenses.filter((e) => e.trip_id === trip.id && !e.deleted),
      payments: store.payments.filter((p) => p.trip_id === trip.id),
      activities: store.activities.filter((a) => a.trip_id === trip.id),
    },
  });
});

app.post("/api/sync/mutation", authMiddleware, async (req: AuthRequest, res) => {
  const { type, tripId, payload } = req.body || {};
  if (!type || !tripId) {
    return res.status(400).json({ success: false, error: "type and tripId are required" });
  }

  if (pool) {
    try {
      switch (type) {
        case "RECORD_PAYMENT": {
          const payment = payload;
          if (payment && payment.id) {
            if (payment.status && (!payment.amount || !payment.from)) {
              await pool.query(
                `UPDATE public.payments
                 SET status = $1,
                     confirmed_by = COALESCE($2, confirmed_by),
                     confirmed_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE confirmed_at END,
                     cancelled_by = COALESCE($3, cancelled_by),
                     cancelled_at = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE cancelled_at END,
                     updated_at = NOW()
                 WHERE id = $4;`,
                [payment.status, payment.confirmedBy || null, payment.cancelledBy || null, payment.id]
              );
            } else {
              await pool.query(
                `INSERT INTO public.payments (
                  id, trip_id, from_member_id, to_member_id, from_user_id, to_user_id,
                  amount, status, method, note, original_amount, original_currency, exchange_rate,
                  created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET
                  from_member_id = EXCLUDED.from_member_id,
                  to_member_id = EXCLUDED.to_member_id,
                  amount = EXCLUDED.amount,
                  status = EXCLUDED.status,
                  method = EXCLUDED.method,
                  note = EXCLUDED.note,
                  updated_at = NOW();`,
                [
                  payment.id,
                  tripId,
                  payment.from || payment.fromUserId || "",
                  payment.to || payment.toUserId || "",
                  payment.fromUserId || payment.from || "",
                  payment.toUserId || payment.to || "",
                  Number(payment.amount) || 0,
                  payment.status || "confirmed",
                  payment.method || "Cash",
                  payment.note || "",
                  payment.originalAmount != null ? Number(payment.originalAmount) : null,
                  payment.currency || null,
                  payment.exchangeRate != null ? Number(payment.exchangeRate) : null,
                ]
              );
            }
          }
          break;
        }

        case "DELETE_PAYMENT": {
          const paymentId = payload?.paymentId || payload?.id;
          if (paymentId) {
            await pool.query("DELETE FROM public.payments WHERE id = $1;", [paymentId]);
          }
          break;
        }

        case "SAVE_EXPENSE": {
          const expense = payload;
          if (expense && expense.id) {
            const participantsList =
              Array.isArray(expense.participants) && expense.participants.length > 0
                ? expense.participants
                : [expense.paidBy || req.userId || "traveler"];

            await pool.query(
              `INSERT INTO public.expenses (
                id, trip_id, title, amount, category, date, paid_by, payers, created_by,
                method, split_type, participants, splits, split_percentages, split_shares,
                notes, receipt_url, original_amount, original_currency, exchange_rate,
                created_at, updated_at, deleted
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
                $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
                $16, $17, $18, $19, $20,
                NOW(), NOW(), $21
              )
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                amount = EXCLUDED.amount,
                category = EXCLUDED.category,
                date = EXCLUDED.date,
                paid_by = EXCLUDED.paid_by,
                payers = EXCLUDED.payers,
                method = EXCLUDED.method,
                split_type = EXCLUDED.split_type,
                participants = EXCLUDED.participants,
                splits = EXCLUDED.splits,
                split_percentages = EXCLUDED.split_percentages,
                split_shares = EXCLUDED.split_shares,
                notes = EXCLUDED.notes,
                receipt_url = EXCLUDED.receipt_url,
                deleted = EXCLUDED.deleted,
                updated_at = NOW();`,
              [
                expense.id,
                tripId,
                expense.title || "Expense",
                Number(expense.amount) || 0,
                expense.category || "General",
                expense.date || new Date().toISOString().split("T")[0],
                expense.paidBy || "",
                JSON.stringify(expense.payers || null),
                expense.createdBy || req.userId || "",
                expense.method || "equal",
                expense.splitType || expense.method || "equal",
                JSON.stringify(participantsList),
                JSON.stringify(expense.splits || {}),
                JSON.stringify(expense.splitPercentages || null),
                JSON.stringify(expense.splitShares || null),
                expense.notes || "",
                expense.receiptUrl || "",
                expense.originalAmount != null ? Number(expense.originalAmount) : null,
                expense.currency || null,
                expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
                Boolean(expense.deleted),
              ]
            );
          }
          break;
        }

        case "DELETE_EXPENSE": {
          const expenseId = payload?.expenseId || payload?.id;
          if (expenseId) {
            await pool.query("UPDATE public.expenses SET deleted = true, deleted_at = NOW() WHERE id = $1;", [expenseId]);
          }
          break;
        }

        case "SAVE_MEMBER": {
          const member = payload;
          if (member) {
            const memId = member.id || member.userId || `m_${Date.now()}`;
            await pool.query(
              `INSERT INTO public.trip_members (
                id, trip_id, user_id, name, role, avatar_color, phone, email, joined_at, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                avatar_color = EXCLUDED.avatar_color,
                phone = EXCLUDED.phone,
                email = EXCLUDED.email,
                status = EXCLUDED.status;`,
              [
                memId,
                tripId,
                member.userId || memId,
                member.name || "Member",
                member.role || "member",
                member.avatarColor || "#0F6B65",
                member.phone || "",
                member.email || "",
                member.status || "active",
              ]
            );
          }
          break;
        }

        case "DELETE_MEMBER": {
          const memberId = payload?.memberId || payload?.id;
          if (memberId) {
            await pool.query("DELETE FROM public.trip_members WHERE id = $1;", [memberId]);
          }
          break;
        }

        case "SAVE_TRIP_SNAPSHOT": {
          const trip = payload;
          if (trip && trip.id) {
            const memberUserIds = Array.from(
              new Set([
                trip.ownerId,
                ...(trip.memberUserIds || []),
                ...(trip.members || []).map((m: any) => m.userId || m.id),
              ].filter(Boolean))
            );
            await pool.query(
              `INSERT INTO public.trips (
                id, title, location, destination, start_date, end_date, currency, status,
                owner_id, owner_name, member_user_ids, invite_code, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, NOW(), NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                location = EXCLUDED.location,
                destination = EXCLUDED.destination,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                currency = EXCLUDED.currency,
                status = EXCLUDED.status,
                member_user_ids = EXCLUDED.member_user_ids,
                updated_at = NOW();`,
              [
                trip.id,
                trip.title || trip.name || "Untitled Trip",
                trip.location || trip.destination || "Destination",
                trip.destination || trip.location || "Destination",
                trip.startDate || new Date().toISOString().split("T")[0],
                trip.endDate || new Date().toISOString().split("T")[0],
                trip.currency || "INR",
                trip.status || "ACTIVE",
                trip.ownerId || req.userId || "",
                trip.ownerName || "Traveler",
                JSON.stringify(memberUserIds),
                trip.inviteCode || `TRIP-${trip.id.slice(-6).toUpperCase()}`,
              ]
            );
          }
          break;
        }

        case "DELETE_TRIP": {
          await pool.query("DELETE FROM public.trips WHERE id = $1;", [tripId]);
          break;
        }
      }

      return res.json({ success: true, processedVia: "postgres" });
    } catch (err: any) {
      console.warn("Notice executing mutation in PostgreSQL:", err?.message || err);
    }
  }

  // Local store fallback
  const store = getLocalStore();
  if (type === "RECORD_PAYMENT" && payload?.id) {
    const idx = store.payments.findIndex((p: any) => p.id === payload.id);
    if (idx >= 0) store.payments[idx] = { ...store.payments[idx], ...payload };
    else store.payments.push({ ...payload, trip_id: tripId });
  } else if (type === "SAVE_EXPENSE" && payload?.id) {
    const idx = store.expenses.findIndex((e: any) => e.id === payload.id);
    if (idx >= 0) store.expenses[idx] = { ...store.expenses[idx], ...payload };
    else store.expenses.push({ ...payload, trip_id: tripId });
  }
  saveLocalStore(store);

  return res.json({ success: true, processedVia: "local_store" });
});

app.get("/api/download-audit-pdf", (_req, res) => {
  const filePath = path.resolve(__dirname, "public", "Spliito_Application_Review.pdf");
  res.download(filePath, "Spliito_Application_Review.pdf");
});

async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const { patchViteClient } = await import("./scripts/patch-vite-client.js");
      patchViteClient();
    } catch {}
    const fs = await import("fs");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: __dirname,
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        const filterTag = `<script>
(function(){
  if(typeof window!=='undefined'&&window.WebSocket){
    var OrigWS=window.WebSocket;
    var DummyWS=function(u,p){
      if(p==='vite-hmr'||(typeof u==='string'&&(u.indexOf('24678')!==-1||u.indexOf('token=')!==-1))){
        var t=new EventTarget();
        t.readyState=1;
        t.url=u;
        t.protocol='vite-hmr';
        t.send=function(){};
        t.close=function(){};
        setTimeout(function(){
          var ev=new Event('open');
          t.dispatchEvent(ev);
          if(typeof t.onopen==='function')t.onopen(ev);
        },10);
        return t;
      }
      return new OrigWS(u,p);
    };
    DummyWS.prototype=OrigWS.prototype;
    DummyWS.CONNECTING=0;DummyWS.OPEN=1;DummyWS.CLOSING=2;DummyWS.CLOSED=3;
    window.WebSocket=DummyWS;
  }
  var _e=console.error;
  console.error=function(){
    if(arguments[0]&&typeof arguments[0]==='string'&&(arguments[0].indexOf('[vite]')!==-1||arguments[0].indexOf('websocket')!==-1||arguments[0].indexOf('WebSocket')!==-1))return;
    return _e.apply(console,arguments);
  };
  var _w=console.warn;
  console.warn=function(){
    if(arguments[0]&&typeof arguments[0]==='string'&&(arguments[0].indexOf('[vite]')!==-1||arguments[0].indexOf('websocket')!==-1||arguments[0].indexOf('WebSocket')!==-1))return;
    return _w.apply(console,arguments);
  };
  window.addEventListener('unhandledrejection',function(e){
    if(e.reason&&(typeof e.reason==='string'||e.reason.message)&&(String(e.reason.message||e.reason).indexOf('[vite]')!==-1||String(e.reason.message||e.reason).indexOf('WebSocket')!==-1)){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });
})();
</script>`;
        template = template.replace("<head>", `<head>\n    ${filterTag}`);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`TripSplit server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  setupServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}

export default app;
