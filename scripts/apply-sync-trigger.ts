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

async function run() {
  const client = await pool.connect();
  try {
    const sql = `
      CREATE OR REPLACE FUNCTION public.sync_trip_member_user_ids()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        v_trip_id TEXT;
      BEGIN
        v_trip_id := COALESCE(NEW.trip_id, OLD.trip_id);

        UPDATE public.trips
        SET
          member_user_ids = (
            SELECT COALESCE(jsonb_agg(DISTINCT user_id), '[]'::jsonb)
            FROM public.trip_members
            WHERE trip_id = v_trip_id AND user_id IS NOT NULL AND user_id <> ''
          ),
          updated_at = NOW()
        WHERE id = v_trip_id;

        RETURN COALESCE(NEW, OLD);
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_sync_trip_member_user_ids ON public.trip_members;
      CREATE TRIGGER trg_sync_trip_member_user_ids
        AFTER INSERT OR UPDATE OR DELETE ON public.trip_members
        FOR EACH ROW
        EXECUTE FUNCTION public.sync_trip_member_user_ids();
    `;
    await client.query(sql);
    console.log("Trigger trg_sync_trip_member_user_ids applied successfully!");
  } catch (e) {
    console.error("Error applying trigger:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
