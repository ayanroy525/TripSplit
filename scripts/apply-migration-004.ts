import { Pool } from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const rawConn = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "").replace(/\?.*$/, "");

const pool = new Pool({
  connectionString: rawConn,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function runMigration() {
  console.log("Applying Migration 004 to Supabase...");
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/004_atomic_transactions_and_multicurrency.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("Migration 004 executed successfully!");

    // Verify columns
    const colsExp = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'expenses' AND column_name IN ('original_amount', 'original_currency', 'exchange_rate');");
    console.log("New expenses columns verified:", colsExp.rows.map(r => r.column_name));

    // Verify routines
    const routines = await client.query("SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('record_payment_atomic', 'save_expense_atomic', 'confirm_payment_atomic');");
    console.log("New RPC routines verified:", routines.rows.map(r => r.routine_name));
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
