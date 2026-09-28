import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

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

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
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

// Vite Middleware for Development / Static serving for Production
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
        watch: process.env.DISABLE_HMR === "true" ? null : {},
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
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
