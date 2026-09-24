import {
  Trip,
  UserAccount,
  StorageSchema,
  Member,
  Expense,
  Payment,
  Activity,
} from "../types";
import { uid, nowStr } from "./calculations";
import {
  supabase,
  mapTripRowToTrip,
  mapTripToRow,
  mapMemberRowToMember,
  mapMemberToRow,
  mapExpenseRowToExpense,
  mapExpenseToRow,
  mapPaymentRowToPayment,
  mapPaymentToRow,
  mapActivityRowToActivity,
  mapActivityToRow,
} from "./supabaseClient";
import { enqueueOfflineMutation } from "./offlineSync";

export type Unsubscribe = () => void;

export const SCHEMA_VERSION = 3;
export const STORAGE_KEY = `trip_expense_splitter_v${SCHEMA_VERSION}`;
export const USER_STORAGE_KEY = "trip_expense_splitter_auth_user_v3";

export function getUserTripsStorageKey(userId: string): string {
  return `tripExpenseSplitter:user:${userId}:trips`;
}

export function getUserActiveTripStorageKey(userId: string): string {
  return `tripExpenseSplitter:user:${userId}:activeTrip`;
}

export function getUserSettingsStorageKey(userId: string): string {
  return `tripExpenseSplitter:user:${userId}:settings`;
}

/**
 * Verifies if a user is an authorized owner or member of a trip.
 */
export function isUserAuthorizedForTrip(trip: Partial<Trip>, userId: string): boolean {
  if (!userId || !trip) return false;
  if (trip.ownerId === userId) return true;
  if (Array.isArray((trip as any).memberUserIds) && (trip as any).memberUserIds.includes(userId)) return true;
  if (Array.isArray((trip as any).member_user_ids) && (trip as any).member_user_ids.includes(userId)) return true;
  if (Array.isArray(trip.members) && trip.members.some((m) => m.userId === userId || m.id === userId)) return true;
  return false;
}

export const DEFAULT_AUTH_USER: UserAccount = {
  id: "user_guest",
  name: "Guest Explorer",
  email: "guest@splittrip.local",
  phone: "",
  avatarColor: "#0F6B65",
  bio: "Trip traveler",
  createdAt: new Date().toISOString(),
};

/**
 * Dummy quota handler for compatibility.
 */
export function checkAndSetQuotaExhaustion(_err: any): boolean {
  return false;
}

export function isQuotaExhaustedActive(): boolean {
  return false;
}

export function sanitizeData<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        clean[key] = sanitizeData(val);
      } else {
        clean[key] = val;
      }
    }
  }
  return clean;
}

export function extractTripDocData(trip: Trip): Record<string, any> {
  return mapTripToRow(trip);
}

/**
 * Saves or updates an entire Trip including all sub-tables into Supabase.
 * If offline or if the network request fails, transparently enqueues mutation for auto-sync.
 */
export async function saveTripToDatabase(trip: Trip): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("SAVE_TRIP_SNAPSHOT", trip.id, trip);
    return;
  }

  try {
    // 1. Root Trip
    const tripRow = mapTripToRow(trip);
    const { error: tripError } = await supabase.from("trips").upsert(tripRow);
    if (tripError) {
      console.warn("Supabase trip upsert notice (queuing offline):", tripError.message);
      enqueueOfflineMutation("SAVE_TRIP_SNAPSHOT", trip.id, trip);
      return;
    }

    // 2. Members
    if (trip.members && trip.members.length > 0) {
      const memberRows = trip.members.map((m) => mapMemberToRow(trip.id, m));
      const { error: memError } = await supabase.from("trip_members").upsert(memberRows);
      if (memError) {
        console.warn("Supabase members upsert notice:", memError.message);
      }
    }

    // 3. Expenses
    if (trip.expenses && trip.expenses.length > 0) {
      const expenseRows = trip.expenses.map((e) => mapExpenseToRow(trip.id, e));
      const { error: expError } = await supabase.from("expenses").upsert(expenseRows);
      if (expError) {
        console.warn("Supabase expenses upsert notice:", expError.message);
      }
    }

    // 4. Payments
    if (trip.payments && trip.payments.length > 0) {
      const paymentRows = trip.payments.map((p) => mapPaymentToRow(trip.id, p));
      const { error: payError } = await supabase.from("payments").upsert(paymentRows);
      if (payError) {
        console.warn("Supabase payments upsert notice:", payError.message);
      }
    }

    // 5. Activities
    if (trip.activities && trip.activities.length > 0) {
      const activityRows = trip.activities.map((a) => mapActivityToRow(trip.id, a));
      const { error: actError } = await supabase.from("activities").upsert(activityRows);
      if (actError) {
        console.warn("Supabase activities upsert notice:", actError.message);
      }
    }
  } catch (error: any) {
    console.warn(`Network error saving trip ${trip.id} to Supabase, queued offline:`, error);
    enqueueOfflineMutation("SAVE_TRIP_SNAPSHOT", trip.id, trip);
  }
}

/**
 * Fetches a single trip with all its relational rows from Supabase.
 */
export async function getTripFromDatabase(tripId: string): Promise<Trip | null> {
  try {
    const { data: tripRow, error: tripErr } = await supabase
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .maybeSingle();

    if (tripErr || !tripRow) {
      return null;
    }

    const [membersRes, expensesRes, paymentsRes, activitiesRes] = await Promise.all([
      supabase.from("trip_members").select("*").eq("trip_id", tripId),
      supabase.from("expenses").select("*").eq("trip_id", tripId),
      supabase.from("payments").select("*").eq("trip_id", tripId),
      supabase.from("activities").select("*").eq("trip_id", tripId),
    ]);

    const members = (membersRes.data || []).map(mapMemberRowToMember);
    const expenses = (expensesRes.data || []).map(mapExpenseRowToExpense);
    const payments = (paymentsRes.data || []).map(mapPaymentRowToPayment);
    const activities = (activitiesRes.data || []).map(mapActivityRowToActivity);

    return mapTripRowToTrip(tripRow, members, expenses, payments, activities);
  } catch (err) {
    console.error("Error loading trip from Supabase:", err);
    return null;
  }
}

// Backwards compatibility alias
export const getTripFromFirestore = getTripFromDatabase;

/**
 * Fetches all trips from Supabase.
 */
export async function getAllTripsFromDatabase(): Promise<Trip[]> {
  try {
    const { data: tripRows, error: tripErr } = await supabase
      .from("trips")
      .select("*")
      .order("created_at", { ascending: false });

    if (tripErr || !tripRows) {
      return [];
    }

    const trips: Trip[] = [];
    for (const row of tripRows) {
      const full = await getTripFromDatabase(row.id);
      if (full) {
        trips.push(full);
      }
    }
    return trips;
  } catch (err) {
    console.error("Error loading all trips from Supabase:", err);
    return [];
  }
}

// Backwards compatibility alias
export const getAllTripsFromFirestore = getAllTripsFromDatabase;

/**
 * Subscribes to real-time updates for a single trip.
 */
export function subscribeToTrip(
  tripId: string,
  onTripUpdate: (trip: Trip | null) => void,
  _onError?: (err: Error) => void
): Unsubscribe {
  // 1. Initial load
  getTripFromDatabase(tripId).then((trip) => {
    onTripUpdate(trip);
  });

  // 2. Realtime listener
  const channel = supabase
    .channel(`trip-${tripId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
      () => {
        getTripFromDatabase(tripId).then((trip) => onTripUpdate(trip));
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` },
      () => {
        getTripFromDatabase(tripId).then((trip) => onTripUpdate(trip));
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${tripId}` },
      () => {
        getTripFromDatabase(tripId).then((trip) => onTripUpdate(trip));
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments", filter: `trip_id=eq.${tripId}` },
      () => {
        getTripFromDatabase(tripId).then((trip) => onTripUpdate(trip));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to all trips for a given user.
 */
export function subscribeToUserTrips(
  userId: string,
  onTripsUpdate: (trips: Trip[]) => void,
  _onError?: (err: Error) => void
): Unsubscribe {
  if (!userId) return () => {};

  const loadTrips = async () => {
    try {
      const { data: tripRows, error } = await supabase
        .from("trips")
        .select("*")
        .order("created_at", { ascending: false });

      if (error || !tripRows) {
        return;
      }

      const matchingRows = tripRows.filter((row) => {
        const isOwner = row.owner_id === userId;
        const inMembers =
          Array.isArray(row.member_user_ids) && row.member_user_ids.includes(userId);
        return isOwner || inMembers;
      });

      const fullTrips: Trip[] = [];
      for (const row of matchingRows) {
        const trip = await getTripFromDatabase(row.id);
        if (trip) fullTrips.push(trip);
      }

      onTripsUpdate(fullTrips);
    } catch (err) {
      console.warn("Error fetching user trips from Supabase:", err);
    }
  };

  // Initial fetch
  loadTrips();

  // Supabase Realtime channel
  const channel = supabase
    .channel(`user-trips-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
      loadTrips();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "trip_members" }, () => {
      loadTrips();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to all trips across the app.
 */
export function subscribeToAllTrips(
  onTripsUpdate: (trips: Trip[]) => void,
  _onError?: (err: Error) => void
): Unsubscribe {
  const loadAll = async () => {
    const trips = await getAllTripsFromDatabase();
    onTripsUpdate(trips);
  };

  loadAll();

  const channel = supabase
    .channel("all-trips")
    .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
      loadAll();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Granular Table Operations
 */

export async function addExpenseToDatabase(tripId: string, expense: Expense): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("SAVE_EXPENSE", tripId, expense);
    return;
  }
  try {
    const row = mapExpenseToRow(tripId, expense);
    const { error } = await supabase.from("expenses").upsert(row);
    if (error) {
      console.warn("Error adding expense to Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("SAVE_EXPENSE", tripId, expense);
    }
  } catch (err) {
    console.warn("Network error adding expense (queuing offline):", err);
    enqueueOfflineMutation("SAVE_EXPENSE", tripId, expense);
  }
}

export async function updateExpenseInDatabase(tripId: string, expense: Expense): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("SAVE_EXPENSE", tripId, expense);
    return;
  }
  try {
    const row = mapExpenseToRow(tripId, expense);
    const { error } = await supabase.from("expenses").upsert(row);
    if (error) {
      console.warn("Error updating expense in Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("SAVE_EXPENSE", tripId, expense);
    }
  } catch (err) {
    console.warn("Network error updating expense (queuing offline):", err);
    enqueueOfflineMutation("SAVE_EXPENSE", tripId, expense);
  }
}

export async function deleteExpenseFromDatabase(tripId: string, expenseId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("DELETE_EXPENSE", tripId, { expenseId });
    return;
  }
  try {
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (error) {
      console.warn("Error deleting expense from Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("DELETE_EXPENSE", tripId, { expenseId });
    }
  } catch (err) {
    console.warn("Network error deleting expense (queuing offline):", err);
    enqueueOfflineMutation("DELETE_EXPENSE", tripId, { expenseId });
  }
}

export async function addPaymentToDatabase(tripId: string, payment: Payment): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("RECORD_PAYMENT", tripId, payment);
    return;
  }
  try {
    const row = mapPaymentToRow(tripId, payment);
    const { error } = await supabase.from("payments").upsert(row);
    if (error) {
      console.warn("Error adding payment to Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("RECORD_PAYMENT", tripId, payment);
    }
  } catch (err) {
    console.warn("Network error adding payment (queuing offline):", err);
    enqueueOfflineMutation("RECORD_PAYMENT", tripId, payment);
  }
}

export async function updatePaymentInDatabase(tripId: string, payment: Payment): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("RECORD_PAYMENT", tripId, payment);
    return;
  }
  try {
    const row = mapPaymentToRow(tripId, payment);
    const { error } = await supabase.from("payments").upsert(row);
    if (error) {
      console.warn("Error updating payment in Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("RECORD_PAYMENT", tripId, payment);
    }
  } catch (err) {
    console.warn("Network error updating payment (queuing offline):", err);
    enqueueOfflineMutation("RECORD_PAYMENT", tripId, payment);
  }
}

export async function deletePaymentFromDatabase(tripId: string, paymentId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("DELETE_PAYMENT", tripId, { paymentId });
    return;
  }
  try {
    const { error } = await supabase.from("payments").delete().eq("id", paymentId);
    if (error) {
      console.warn("Error deleting payment from Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("DELETE_PAYMENT", tripId, { paymentId });
    }
  } catch (err) {
    console.warn("Network error deleting payment (queuing offline):", err);
    enqueueOfflineMutation("DELETE_PAYMENT", tripId, { paymentId });
  }
}

export async function addMemberToDatabase(tripId: string, member: Member): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("SAVE_MEMBER", tripId, member);
    return;
  }
  try {
    const row = mapMemberToRow(tripId, member);
    const { error } = await supabase.from("trip_members").upsert(row);
    if (error) {
      console.warn("Error adding member to Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("SAVE_MEMBER", tripId, member);
    }
  } catch (err) {
    console.warn("Network error adding member (queuing offline):", err);
    enqueueOfflineMutation("SAVE_MEMBER", tripId, member);
  }
}

export async function updateMemberInDatabase(tripId: string, member: Member): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("SAVE_MEMBER", tripId, member);
    return;
  }
  try {
    const row = mapMemberToRow(tripId, member);
    const { error } = await supabase.from("trip_members").upsert(row);
    if (error) {
      console.warn("Error updating member in Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("SAVE_MEMBER", tripId, member);
    }
  } catch (err) {
    console.warn("Network error updating member (queuing offline):", err);
    enqueueOfflineMutation("SAVE_MEMBER", tripId, member);
  }
}

export async function deleteMemberFromDatabase(tripId: string, memberId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("DELETE_MEMBER", tripId, { memberId });
    return;
  }
  try {
    const { error } = await supabase.from("trip_members").delete().eq("id", memberId);
    if (error) {
      console.warn("Error deleting member from Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("DELETE_MEMBER", tripId, { memberId });
    }
  } catch (err) {
    console.warn("Network error deleting member (queuing offline):", err);
    enqueueOfflineMutation("DELETE_MEMBER", tripId, { memberId });
  }
}

export async function addActivityToDatabase(tripId: string, activity: Activity): Promise<void> {
  try {
    const row = mapActivityToRow(tripId, activity);
    await supabase.from("activities").upsert(row);
  } catch (err) {
    console.warn("Network error adding activity:", err);
  }
}

export async function deleteTripFromDatabase(tripId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineMutation("DELETE_TRIP", tripId, {});
    return;
  }
  try {
    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) {
      console.warn("Error deleting trip from Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("DELETE_TRIP", tripId, {});
    }
  } catch (err) {
    console.warn("Network error deleting trip (queuing offline):", err);
    enqueueOfflineMutation("DELETE_TRIP", tripId, {});
  }
}

/**
 * Synchronously loads user-specific cached state with strict data isolation.
 */
export function loadUserLocalState(userId?: string): { trips: Trip[]; activeTripId: string } {
  if (!userId) {
    return { trips: [], activeTripId: "" };
  }

  const userKey = getUserTripsStorageKey(userId);
  const activeKey = getUserActiveTripStorageKey(userId);

  try {
    const raw = localStorage.getItem(userKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const authorizedTrips = parsed.filter((t) => isUserAuthorizedForTrip(t, userId));
        const savedActiveId = localStorage.getItem(activeKey) || "";
        const activeTripId = authorizedTrips.some((t) => t.id === savedActiveId)
          ? savedActiveId
          : authorizedTrips[0]?.id || "";
        return { trips: authorizedTrips, activeTripId };
      }
    }
  } catch (err) {
    console.warn("Could not parse user-namespaced cached state:", err);
  }

  return { trips: [], activeTripId: "" };
}

/**
 * Saves user-specific cached state with strict data isolation.
 */
export function saveUserLocalState(
  userId: string,
  state: { trips: Trip[]; activeTripId?: string }
): boolean {
  if (!userId) return false;
  try {
    const authorizedTrips = (state.trips || []).filter((t) => isUserAuthorizedForTrip(t, userId));
    localStorage.setItem(getUserTripsStorageKey(userId), JSON.stringify(authorizedTrips));
    if (state.activeTripId && authorizedTrips.some((t) => t.id === state.activeTripId)) {
      localStorage.setItem(getUserActiveTripStorageKey(userId), state.activeTripId);
    } else if (authorizedTrips.length > 0) {
      localStorage.setItem(getUserActiveTripStorageKey(userId), authorizedTrips[0].id);
    } else {
      localStorage.removeItem(getUserActiveTripStorageKey(userId));
    }
    return true;
  } catch (err) {
    console.warn("Error saving user local state:", err);
    return false;
  }
}

/**
 * Synchronously loads cached state from localStorage.
 */
export function loadStateFromStorage(): StorageSchema {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trips)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Could not parse cached state from localStorage:", err);
  }

  return {
    version: SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    trips: [],
    activeTripId: "",
    authUser: DEFAULT_AUTH_USER,
    currentUserId: DEFAULT_AUTH_USER.id,
  };
}

/**
 * Asynchronous loader.
 */
export async function loadStateFromDatabase(): Promise<StorageSchema> {
  try {
    const trips = await getAllTripsFromDatabase();
    if (trips.length > 0) {
      return {
        version: SCHEMA_VERSION,
        lastUpdated: new Date().toISOString(),
        trips,
        activeTripId: trips[0].id,
        authUser: DEFAULT_AUTH_USER,
        currentUserId: DEFAULT_AUTH_USER.id,
      };
    }
  } catch (err) {
    console.warn("Could not load state from Supabase:", err);
  }
  return loadStateFromStorage();
}

/**
 * Synchronous localStorage cache saver.
 */
export function saveStateToStorage(state: StorageSchema): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn("Error saving to localStorage:", err);
    return false;
  }
}

/**
 * Wipes/resets state in Supabase and localStorage.
 */
export function resetStorageState(
  _mode: "clean_scratch" = "clean_scratch",
  customUser?: UserAccount
): StorageSchema {
  const user = customUser || DEFAULT_AUTH_USER;

  const freshTripId = uid("trip");
  const ownerMember: Member = {
    id: user.id,
    userId: user.id,
    name: user.name,
    role: "owner",
    avatarColor: user.avatarColor,
    phone: user.phone,
    joinedAt: new Date().toISOString(),
    status: "active",
  };

  const emptyTrip: Trip = {
    id: freshTripId,
    title: "My New Trip",
    location: "Destination",
    destination: "Destination",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
    currency: "INR",
    status: "ACTIVE",
    ownerId: user.id,
    ownerName: user.name,
    inviteCode: `TRIP-${freshTripId.slice(-6).toUpperCase()}`,
    members: [ownerMember],
    expenses: [],
    payments: [],
    activities: [
      {
        id: uid("act"),
        ts: "Just now",
        user: user.name,
        action: "created the trip",
        detail: "My New Trip",
        actorId: user.id,
      },
    ],
    createdAt: new Date().toISOString(),
  };

  saveTripToDatabase(emptyTrip).catch(() => {});

  const cleanState: StorageSchema = {
    version: SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    trips: [emptyTrip],
    activeTripId: emptyTrip.id,
    authUser: user,
    currentUserId: user.id,
  };
  saveStateToStorage(cleanState);
  return cleanState;
}

/**
 * Creates a new trip with standard owner configuration.
 */
export function createNewTripObject(
  title: string,
  location: string,
  currency = "INR",
  startDate?: string,
  endDate?: string,
  owner?: UserAccount,
  additionalMemberNames: string[] = []
): Trip {
  const tripId = uid("trip");
  const user = owner || DEFAULT_AUTH_USER;

  const ownerMember: Member = {
    id: user.id,
    userId: user.id,
    name: user.name,
    role: "owner",
    avatarColor: user.avatarColor,
    phone: user.phone,
    joinedAt: new Date().toISOString(),
    status: "active",
  };

  const AVATAR_PALETTE = [
    "#0F6B65",
    "#E39A2D",
    "#8B5CF6",
    "#0284C7",
    "#D97706",
    "#EC4899",
    "#10B981",
    "#6366F1",
  ];

  const extraMembers: Member[] = additionalMemberNames
    .filter((n) => n.trim().length > 0)
    .map((name, idx) => ({
      id: uid("usr"),
      userId: uid("usr"),
      name: name.trim(),
      role: "member",
      avatarColor: AVATAR_PALETTE[(idx + 1) % AVATAR_PALETTE.length],
      joinedAt: new Date().toISOString(),
      status: "active",
    }));

  const allMembers = [ownerMember, ...extraMembers];

  return {
    id: tripId,
    title: title.trim() || "Untitled Trip",
    location: location.trim() || "Destination",
    destination: location.trim() || "Destination",
    startDate: startDate || new Date().toISOString().split("T")[0],
    endDate: endDate || new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
    currency,
    status: "ACTIVE",
    ownerId: user.id,
    ownerName: user.name,
    inviteCode: `TRIP-${tripId.slice(-6).toUpperCase()}`,
    members: allMembers,
    expenses: [],
    payments: [],
    activities: [
      {
        id: uid("act"),
        ts: "Just now",
        user: user.name,
        action: "created the trip",
        detail: title.trim() || "New Trip",
        actorId: user.id,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}
