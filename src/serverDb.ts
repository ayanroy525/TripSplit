import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export interface LocalTripRecord {
  id: string;
  name: string;
  description?: string;
  currency?: string;
  owner_id: string;
  invite_code?: string;
  member_user_ids?: string[];
  created_at: string;
  updated_at?: string;
}

export interface ServerStoreSchema {
  users: LocalUserRecord[];
  trips: LocalTripRecord[];
  trip_members: LocalMemberRecord[];
  expenses: any[];
  payments: any[];
  activities: any[];
}

const DATA_DIR = path.resolve(__dirname, "..", "data");
const STORE_PATH = path.resolve(DATA_DIR, "server_store.json");

export function getLocalStore(): ServerStoreSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial: ServerStoreSchema = {
        users: [],
        trips: [],
        trip_members: [],
        expenses: [],
        payments: [],
        activities: [],
      };
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), "utf-8");
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      trips: Array.isArray(parsed.trips) ? parsed.trips : [],
      trip_members: Array.isArray(parsed.trip_members) ? parsed.trip_members : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
    };
  } catch (err) {
    console.warn("Notice reading server_store.json, using in-memory fallback:", err);
    return { users: [], trips: [], trip_members: [], expenses: [], payments: [], activities: [] };
  }
}

export function saveLocalStore(data: ServerStoreSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Notice saving server_store.json:", err);
  }
}

export function findLocalUser(identifier: string): LocalUserRecord | null {
  const store = getLocalStore();
  const trimmed = identifier.trim().toLowerCase();
  const cleanDigits = identifier.replace(/\D/g, "");

  // 1. By email or name exact match
  let found = store.users.find(
    (u) =>
      (u.email && u.email.trim().toLowerCase() === trimmed) ||
      (u.name && u.name.trim().toLowerCase() === trimmed)
  );

  // 2. By phone match
  if (!found && cleanDigits.length >= 7) {
    found = store.users.find((u) => {
      const phoneDigits = (u.phone || "").replace(/\D/g, "");
      return (
        phoneDigits.length >= 7 &&
        (phoneDigits.endsWith(cleanDigits) || cleanDigits.endsWith(phoneDigits))
      );
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
      return (
        phoneDigits.length >= 7 &&
        (phoneDigits.endsWith(cleanDigits) || cleanDigits.endsWith(phoneDigits))
      );
    });
  }

  return found || null;
}

export function saveLocalUser(user: LocalUserRecord): void {
  const store = getLocalStore();
  const idx = store.users.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    store.users[idx] = user;
  } else {
    store.users.push(user);
  }
  saveLocalStore(store);
}

export function getFullTripsForUser(userId: string): any[] {
  const store = getLocalStore();
  const matchingTrips = store.trips.filter((t) => {
    if (t.owner_id === userId) return true;
    if (Array.isArray(t.member_user_ids) && t.member_user_ids.includes(userId)) return true;
    return store.trip_members.some((m) => m.trip_id === t.id && (m.user_id === userId || m.id === userId));
  });

  return matchingTrips.map((trip) => ({
    ...trip,
    members: store.trip_members.filter((m) => m.trip_id === trip.id),
    expenses: store.expenses.filter((e) => e.trip_id === trip.id && !e.deleted),
    payments: store.payments.filter((p) => p.trip_id === trip.id),
    activities: store.activities.filter((a) => a.trip_id === trip.id),
  }));
}
