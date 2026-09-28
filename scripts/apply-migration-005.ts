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
  console.log("Applying Migration 005 to Supabase...");
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/005_itemized_splits.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("Migration 005 executed successfully!");

    // Verify items column in expenses
    const colsExp = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'items';");
    console.log("Verified expenses.items column exists:", colsExp.rows.map(r => r.column_name));
  } catch (err) {
    console.error("Migration 005 error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
