import { Pool } from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const rawConn = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "").replace(/\?.*$/, "");

if (!rawConn) {
  console.log("No PostgreSQL connection string found in environment.");
  process.exit(0);
}

const pool = new Pool({
  connectionString: rawConn,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function runMigration() {
  console.log("Applying Migration 006 (Granular Roles & Permissions) to Supabase...");
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/006_granular_roles_and_permissions.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("Migration 006 executed successfully!");

    // Check roles distribution in trip_members
    const rolesRes = await client.query("SELECT role, COUNT(*) FROM public.trip_members GROUP BY role;");
    console.log("Updated trip_members roles distribution:", rolesRes.rows);

    // Verify policies
    const policiesRes = await client.query("SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;");
    console.log("Verified active RLS policies count:", policiesRes.rows.length);
  } catch (err) {
    console.error("Migration 006 error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
