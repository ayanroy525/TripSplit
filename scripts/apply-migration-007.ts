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
  console.log("Applying Migration 007 (Invite Code Procedures) to Supabase...");
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/007_invite_code_procedures.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("Migration 007 executed successfully!");

    // Test calling get_trip_by_invite_code with 'TRIP-F25K4S'
    const testRes = await client.query("SELECT public.get_trip_by_invite_code('TRIP-F25K4S') AS res;");
    console.log("Test RPC get_trip_by_invite_code('TRIP-F25K4S'):", JSON.stringify(testRes.rows[0]?.res, null, 2));

    // Test calling with invalid code
    const invalidRes = await client.query("SELECT public.get_trip_by_invite_code('TRIP-INVALID') AS res;");
    console.log("Test RPC invalid code:", JSON.stringify(invalidRes.rows[0]?.res, null, 2));

  } catch (err) {
    console.error("Migration 007 error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
