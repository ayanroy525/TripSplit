import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const rawConn = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "").replace(/\?.*$/, "");

const pool = new Pool({
  connectionString: rawConn,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initSchema() {
  console.log("Connecting to Supabase PostgreSQL...");
  const client = await pool.connect();
  try {
    console.log("Connected successfully. Creating tables...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        phone TEXT,
        avatar_color TEXT,
        avatar_url TEXT,
        bio TEXT,
        password_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        location TEXT,
        destination TEXT,
        start_date TEXT,
        end_date TEXT,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'ACTIVE',
        owner_id TEXT,
        owner_name TEXT,
        member_user_ids JSONB DEFAULT '[]'::jsonb,
        invite_code TEXT,
        invite_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        completed_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trip_members (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        user_id TEXT,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        avatar_color TEXT,
        phone TEXT,
        email TEXT,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        category TEXT,
        date TEXT,
        paid_by TEXT,
        payers JSONB,
        created_by TEXT,
        method TEXT,
        split_type TEXT,
        participants JSONB DEFAULT '[]'::jsonb,
        splits JSONB DEFAULT '{}'::jsonb,
        split_percentages JSONB,
        split_shares JSONB,
        notes TEXT,
        receipt_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMPTZ,
        deleted_by TEXT,
        audit_logs JSONB DEFAULT '[]'::jsonb
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        from_member_id TEXT,
        to_member_id TEXT,
        from_user_id TEXT,
        to_user_id TEXT,
        amount NUMERIC NOT NULL,
        status TEXT DEFAULT 'confirmed',
        method TEXT DEFAULT 'Cash',
        ts TEXT,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        paid_at TIMESTAMPTZ,
        marked_paid_by TEXT,
        confirmed_by TEXT,
        confirmed_at TIMESTAMPTZ,
        cancelled_by TEXT,
        cancelled_at TIMESTAMPTZ,
        cancellation_reason TEXT,
        disputed_by TEXT,
        disputed_at TIMESTAMPTZ,
        dispute_reason TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        audit_logs JSONB DEFAULT '[]'::jsonb
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        ts TEXT,
        user_name TEXT,
        action TEXT,
        detail TEXT,
        actor_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Indexes for fast querying
      CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_id);
      CREATE INDEX IF NOT EXISTS idx_trips_invite ON trips(invite_code);
      CREATE INDEX IF NOT EXISTS idx_members_trip ON trip_members(trip_id);
      CREATE INDEX IF NOT EXISTS idx_members_user ON trip_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);
      CREATE INDEX IF NOT EXISTS idx_payments_trip ON payments(trip_id);
      CREATE INDEX IF NOT EXISTS idx_activities_trip ON activities(trip_id);
    `);

    console.log("Supabase schema initialized successfully!");
  } catch (err) {
    console.error("Error setting up schema:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

initSchema();
