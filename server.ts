import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const rawConn = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "").replace(/\?.*$/, "");
const pool = rawConn
  ? new Pool({
      connectionString: rawConn,
      ssl: { rejectUnauthorized: false },
    })
  : null;

function hashPasswordNode(password: string): string {
  return crypto.createHash("sha256").update(password + "_tripsplit_salt_v1").digest("hex");
}

function verifyPasswordMatchNode(inputPassword: string, storedHashOrPassword?: string | null): boolean {
  if (!storedHashOrPassword || storedHashOrPassword.trim() === "") return true;
  if (storedHashOrPassword === inputPassword || storedHashOrPassword.trim() === inputPassword.trim()) return true;

  // Salted SHA-256
  const salted = crypto.createHash("sha256").update(inputPassword + "_tripsplit_salt_v1").digest("hex");
  if (storedHashOrPassword === salted) return true;

  // Unsalted SHA-256
  const unsalted = crypto.createHash("sha256").update(inputPassword).digest("hex");
  if (storedHashOrPassword === unsalted) return true;

  // Simple string hash
  let simpleHash = 0;
  for (let i = 0; i < inputPassword.length; i++) {
    simpleHash = ((simpleHash << 5) - simpleHash + inputPassword.charCodeAt(i)) | 0;
  }
  if (storedHashOrPassword === `fb_${Math.abs(simpleHash)}`) return true;

  return false;
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Authentication: Login Endpoint
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

  if (!pool) {
    return res.status(503).json({ success: false, error: "Database service temporarily offline." });
  }

  try {
    // 1. Search in public.users table
    const usersQuery = `
      SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, created_at
      FROM public.users
      WHERE LOWER(TRIM(COALESCE(email, ''))) = $1
         OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%')
         OR LOWER(TRIM(COALESCE(name, ''))) = $1
      LIMIT 1;
    `;
    const userRes = await pool.query(usersQuery, [trimmedLower, cleanDigits.length >= 7 ? cleanDigits : ""]);
    let foundUser = userRes.rows[0];

    // If not found by exact match, search all users if cleanDigits is valid
    if (!foundUser && cleanDigits.length >= 7) {
      const allUsersRes = await pool.query("SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, created_at FROM public.users LIMIT 200;");
      foundUser = allUsersRes.rows.find((u) => {
        const uPhone = (u.phone || "").replace(/\D/g, "");
        return uPhone.length >= 7 && (uPhone.endsWith(cleanDigits) || cleanDigits.endsWith(uPhone));
      });
    }

    // 2. If not found in public.users, search in trip_members or members
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
          // Register in users table
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

          return res.json({
            success: true,
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
        console.warn("Notice querying trip_members:", e);
      }
    }

    if (!foundUser) {
      return res.status(404).json({
        success: false,
        error: "No account found matching this email or phone number. Please check your credentials or click 'Create Account' to sign up.",
      });
    }

    // Verify Password
    const isPassValid = verifyPasswordMatchNode(inputPassword, foundUser.password_hash);
    if (!isPassValid) {
      return res.status(401).json({
        success: false,
        error: "Incorrect password for this account. Please verify your password or use 'Forgot Password?' to reset it.",
      });
    }

    // Upgrade hash if necessary
    const modernHash = hashPasswordNode(inputPassword);
    if (foundUser.password_hash !== modernHash) {
      try {
        await pool.query("UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2;", [
          modernHash,
          foundUser.id,
        ]);
      } catch (e) {}
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

    return res.json({ success: true, user: userAccount });
  } catch (err: any) {
    console.error("Error in /api/auth/login:", err);
    return res.status(500).json({ success: false, error: "Internal authentication error. Please try again." });
  }
});

// Authentication: Signup Endpoint
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

  if (!pool) {
    return res.status(503).json({ success: false, error: "Database service temporarily offline." });
  }

  try {
    // Check if user already exists
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

    const userId = `u_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    const hashedPassword = hashPasswordNode(inputPassword);

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

    const userAccount = {
      id: userId,
      name: trimmedName,
      email: trimmedEmail,
      phone: rawPhone || undefined,
      avatarColor: avatarColor || "#E39A2D",
      bio: bio || "Travel Enthusiast",
      createdAt: new Date().toISOString(),
    };

    return res.json({ success: true, user: userAccount });
  } catch (err: any) {
    console.error("Error in /api/auth/signup:", err);
    return res.status(500).json({ success: false, error: "Unable to create account. Please try again." });
  }
});

// Trip Invite Preview Endpoint
app.get("/api/trips/invite/:code", async (req, res) => {
  const code = (req.params.code || "").trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ success: false, message: "Code is required" });
  }

  if (!pool) {
    return res.status(503).json({ success: false, message: "Database connection not available" });
  }

  try {
    const dbRes = await pool.query("SELECT public.get_trip_by_invite_code($1) AS res;", [code]);
    const payload = dbRes.rows[0]?.res;
    if (!payload || !payload.success) {
      return res.status(404).json(payload || { success: false, message: "Invite code is invalid or expired." });
    }
    return res.json(payload);
  } catch (err: any) {
    console.error("Error in /api/trips/invite:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Trip Invite Join Endpoint
app.post("/api/trips/join", async (req, res) => {
  const { inviteCode, user } = req.body || {};
  const code = (inviteCode || "").trim().toUpperCase();

  if (!code || !user || !user.id) {
    return res.status(400).json({ success: false, message: "Invite code and user are required" });
  }

  if (!pool) {
    return res.status(503).json({ success: false, message: "Database connection not available" });
  }

  try {
    const dbRes = await pool.query("SELECT public.join_trip_by_invite_code($1, $2::jsonb) AS res;", [
      code,
      JSON.stringify(user),
    ]);
    const payload = dbRes.rows[0]?.res;
    if (!payload || !payload.success) {
      return res.status(400).json(payload || { success: false, message: "Failed to join trip." });
    }
    return res.json(payload);
  } catch (err: any) {
    console.error("Error in /api/trips/join:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// User Trips Endpoint (direct PostgreSQL fallback for all trips involving user)
app.get("/api/user-trips", async (req, res) => {
  const userId = ((req.query.userId as string) || "").trim();
  if (!userId) {
    return res.status(400).json({ success: false, error: "userId parameter is required" });
  }

  if (!pool) {
    return res.status(503).json({ success: false, error: "Database offline" });
  }

  try {
    const tripsQuery = `
      SELECT DISTINCT t.*
      FROM public.trips t
      LEFT JOIN public.trip_members tm ON tm.trip_id = t.id
      WHERE t.owner_id = $1
         OR t.member_user_ids @> to_jsonb($1::text)
         OR tm.user_id = $1
         OR tm.id = $1
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
    console.error("Error in /api/user-trips:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Single Trip Endpoint
app.get("/api/trips/:tripId", async (req, res) => {
  const tripId = (req.params.tripId || "").trim();
  if (!tripId) {
    return res.status(400).json({ success: false, error: "tripId is required" });
  }

  if (!pool) {
    return res.status(503).json({ success: false, error: "Database offline" });
  }

  try {
    const tripRes = await pool.query("SELECT * FROM public.trips WHERE id = $1 LIMIT 1;", [tripId]);
    const trip = tripRes.rows[0];
    if (!trip) {
      return res.status(404).json({ success: false, error: "Trip not found" });
    }

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
  } catch (err: any) {
    console.error("Error in /api/trips/:tripId:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Vite Middleware for Development / Static serving for Production
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const fs = await import("fs");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
        watch: process.env.DISABLE_HMR === "true" ? null : {},
      },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
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

setupServer().catch((err) => {
  console.error("Failed to start server:", err);
});
