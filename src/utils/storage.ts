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

function isClientOffline(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  );
}

/**
 * Saves or updates an entire Trip including all sub-tables into Supabase.
 * If offline or if the network request fails, transparently enqueues mutation for auto-sync.
 */
export async function saveTripToDatabase(trip: Trip): Promise<void> {
  if (isClientOffline()) {
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
      try {
        const apiRes = await fetch(`/api/trips/${encodeURIComponent(tripId)}`);
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData.success && apiData.trip) {
            const t = apiData.trip;
            return mapTripRowToTrip(
              t,
              (t.members || []).map(mapMemberRowToMember),
              (t.expenses || []).map(mapExpenseRowToExpense),
              (t.payments || []).map(mapPaymentRowToPayment),
              (t.activities || []).map(mapActivityRowToActivity)
            );
          }
        }
      } catch (e) {}
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
    try {
      const apiRes = await fetch(`/api/trips/${encodeURIComponent(tripId)}`);
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData.success && apiData.trip) {
          const t = apiData.trip;
          return mapTripRowToTrip(
            t,
            (t.members || []).map(mapMemberRowToMember),
            (t.expenses || []).map(mapExpenseRowToExpense),
            (t.payments || []).map(mapPaymentRowToPayment),
            (t.activities || []).map(mapActivityRowToActivity)
          );
        }
      }
    } catch (e) {}
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
 * Robust phone number matching helper
 * Handles various phone number formats (country code +91, national 0 prefix, spaces, dashes, etc.)
 */
export function isPhoneMatch(p1?: string | null, p2?: string | null): boolean {
  if (!p1 || !p2) return false;
  const d1 = p1.replace(/\D/g, "");
  const d2 = p2.replace(/\D/g, "");
  if (d1.length < 7 || d2.length < 7) return false;
  if (d1 === d2) return true;
  if (d1.endsWith(d2) || d2.endsWith(d1)) return true;
  // If both have at least 10 digits (standard national mobile number length), compare last 10 digits
  if (d1.length >= 10 && d2.length >= 10 && d1.slice(-10) === d2.slice(-10)) {
    return true;
  }
  return false;
}

/**
 * Robust email matching helper
 */
export function isEmailMatch(e1?: string | null, e2?: string | null): boolean {
  if (!e1 || !e2) return false;
  const clean1 = e1.trim().toLowerCase();
  const clean2 = e2.trim().toLowerCase();
  return clean1.length > 0 && clean1 === clean2;
}

/**
 * Smart User-Member Linking:
 * When a user signs up or logs in, searches all trip_members records for matches by phone or email.
 * Automatically updates matching member records with the authenticated user_id and adds user_id to
 * trips.member_user_ids so the trip instantly appears on the user's dashboard.
 */
export async function linkUserToExistingTripMembers(
  user: UserAccount
): Promise<{ linkedTripsCount: number; linkedMembersCount: number }> {
  if (!user || !user.id) return { linkedTripsCount: 0, linkedMembersCount: 0 };

  const trimmedEmail = (user.email || "").trim().toLowerCase();
  const cleanPhoneDigits = (user.phone || "").replace(/\D/g, "");

  if (!trimmedEmail && cleanPhoneDigits.length < 7) {
    return { linkedTripsCount: 0, linkedMembersCount: 0 };
  }

  let linkedMembersCount = 0;
  const linkedTripIds = new Set<string>();

  try {
    // 1. Fetch all trip members from database
    const { data: allMembers, error: membersErr } = await supabase
      .from("trip_members")
      .select("*");

    if (membersErr || !Array.isArray(allMembers)) {
      return { linkedTripsCount: 0, linkedMembersCount: 0 };
    }

    // 2. Identify unlinked or placeholder member rows matching this user's email or phone
    const matchingMembers = allMembers.filter((m) => {
      if (!m) return false;
      // If already linked to this exact user ID, skip
      if (m.user_id === user.id) return false;

      // Match by email
      if (isEmailMatch(m.email, user.email)) {
        return true;
      }

      // Match by phone
      if (isPhoneMatch(m.phone, user.phone)) {
        return true;
      }

      return false;
    });

    if (matchingMembers.length === 0) {
      return { linkedTripsCount: 0, linkedMembersCount: 0 };
    }

    // 3. Update matching trip_members records with authenticated user_id
    for (const member of matchingMembers) {
      linkedTripIds.add(member.trip_id);
      linkedMembersCount++;

      const updatePayload: Record<string, any> = {
        user_id: user.id,
      };
      if (!member.email && user.email) {
        updatePayload.email = user.email;
      }
      if (!member.phone && user.phone) {
        updatePayload.phone = user.phone;
      }
      if (
        !member.name ||
        member.name.trim() === "" ||
        member.name === "Member" ||
        member.name === "Guest" ||
        member.name === "Traveler"
      ) {
        if (user.name) {
          updatePayload.name = user.name;
        }
      }

      await supabase
        .from("trip_members")
        .update(updatePayload)
        .eq("id", member.id);
    }

    // 4. Update the trips table member_user_ids array for all affected trips
    for (const tripId of linkedTripIds) {
      try {
        const { data: tripRow } = await supabase
          .from("trips")
          .select("member_user_ids, id")
          .eq("id", tripId)
          .maybeSingle();

        if (tripRow) {
          const currentMemberUserIds = Array.isArray(tripRow.member_user_ids)
            ? tripRow.member_user_ids
            : [];
          if (!currentMemberUserIds.includes(user.id)) {
            const updatedIds = Array.from(new Set([...currentMemberUserIds, user.id]));
            await supabase
              .from("trips")
              .update({
                member_user_ids: updatedIds,
                updated_at: new Date().toISOString(),
              })
              .eq("id", tripId);
          }
        }
      } catch (err) {
        console.warn(`Notice updating member_user_ids for trip ${tripId}:`, err);
      }
    }
  } catch (error) {
    console.warn("Smart User-Member Linking notice:", error);
  }

  return {
    linkedTripsCount: linkedTripIds.size,
    linkedMembersCount,
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
      const [tripsRes, memberRes] = await Promise.all([
        supabase.from("trips").select("*").order("created_at", { ascending: false }),
        supabase.from("trip_members").select("trip_id").eq("user_id", userId),
      ]);

      const tripRows = tripsRes.data;
      if (tripsRes.error || !tripRows) {
        return;
      }

      const myMemberTripIds = new Set((memberRes.data || []).map((r) => r.trip_id));

      const matchingRows = tripRows.filter((row) => {
        const isOwner = row.owner_id === userId;
        const inMembers =
          Array.isArray(row.member_user_ids) && row.member_user_ids.includes(userId);
        const inMemberRows = myMemberTripIds.has(row.id);
        return isOwner || inMembers || inMemberRows;
      });

      const fullTrips: Trip[] = [];
      for (const row of matchingRows) {
        const trip = await getTripFromDatabase(row.id);
        if (trip) fullTrips.push(trip);
      }

      if (fullTrips.length > 0) {
        onTripsUpdate(fullTrips);
      } else {
        // Direct database API fallback
        try {
          const apiRes = await fetch(`/api/user-trips?userId=${encodeURIComponent(userId)}`);
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            if (apiData.success && Array.isArray(apiData.trips)) {
              const mapped = apiData.trips.map((t: any) =>
                mapTripRowToTrip(
                  t,
                  (t.members || []).map(mapMemberRowToMember),
                  (t.expenses || []).map(mapExpenseRowToExpense),
                  (t.payments || []).map(mapPaymentRowToPayment),
                  (t.activities || []).map(mapActivityRowToActivity)
                )
              );
              onTripsUpdate(mapped);
              return;
            }
          }
        } catch (e) {}
        onTripsUpdate([]);
      }
    } catch (err) {
      console.warn("Error fetching user trips from Supabase, attempting API fallback:", err);
      try {
        const apiRes = await fetch(`/api/user-trips?userId=${encodeURIComponent(userId)}`);
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData.success && Array.isArray(apiData.trips)) {
            const mapped = apiData.trips.map((t: any) =>
              mapTripRowToTrip(
                t,
                (t.members || []).map(mapMemberRowToMember),
                (t.expenses || []).map(mapExpenseRowToExpense),
                (t.payments || []).map(mapPaymentRowToPayment),
                (t.activities || []).map(mapActivityRowToActivity)
              )
            );
            onTripsUpdate(mapped);
          }
        }
      } catch (e) {}
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
  if (isClientOffline()) {
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
  if (isClientOffline()) {
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
  if (isClientOffline()) {
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

/**
 * ATOMIC OPERATIONS via Postgres RPC Stored Procedures
 * Guarantees transaction safety for settlements, payments, expenses, and activity trails.
 */

export async function saveExpenseAtomic(
  tripId: string,
  expense: Expense,
  activity?: Activity
): Promise<void> {
  if (isClientOffline()) {
    enqueueOfflineMutation("SAVE_EXPENSE", tripId, expense);
    if (activity) {
      addActivityToDatabase(tripId, activity).catch(() => {});
    }
    return;
  }

  try {
    const expenseRow = mapExpenseToRow(tripId, expense);
    const activityRow = activity ? mapActivityToRow(tripId, activity) : null;

    const { data, error } = await supabase.rpc("save_expense_atomic", {
      p_trip_id: tripId,
      p_expense: expenseRow,
      p_activity: activityRow,
    });

    if (error) {
      console.warn("RPC save_expense_atomic warning, falling back to granular upsert:", error.message);
      await addExpenseToDatabase(tripId, expense);
      if (activity) await addActivityToDatabase(tripId, activity);
    }
  } catch (err) {
    console.warn("Network error in saveExpenseAtomic, falling back:", err);
    await addExpenseToDatabase(tripId, expense);
    if (activity) await addActivityToDatabase(tripId, activity);
  }
}

export async function recordPaymentAtomic(
  tripId: string,
  payment: Payment,
  activity?: Activity
): Promise<void> {
  if (isClientOffline()) {
    enqueueOfflineMutation("RECORD_PAYMENT", tripId, payment);
    if (activity) {
      addActivityToDatabase(tripId, activity).catch(() => {});
    }
    return;
  }

  try {
    const paymentRow = mapPaymentToRow(tripId, payment);
    const activityRow = activity ? mapActivityToRow(tripId, activity) : null;

    const { data, error } = await supabase.rpc("record_payment_atomic", {
      p_trip_id: tripId,
      p_payment: paymentRow,
      p_activity: activityRow,
    });

    if (error) {
      console.warn("RPC record_payment_atomic warning, falling back to granular upsert:", error.message);
      await addPaymentToDatabase(tripId, payment);
      if (activity) await addActivityToDatabase(tripId, activity);
    }
  } catch (err) {
    console.warn("Network error in recordPaymentAtomic, falling back:", err);
    await addPaymentToDatabase(tripId, payment);
    if (activity) await addActivityToDatabase(tripId, activity);
  }
}

export async function confirmPaymentAtomic(
  tripId: string,
  paymentId: string,
  confirmedBy: string,
  activity?: Activity
): Promise<void> {
  if (isClientOffline()) {
    enqueueOfflineMutation("RECORD_PAYMENT", tripId, { id: paymentId, status: "confirmed", confirmedBy });
    if (activity) {
      addActivityToDatabase(tripId, activity).catch(() => {});
    }
    return;
  }

  try {
    const activityRow = activity ? mapActivityToRow(tripId, activity) : null;
    const { data, error } = await supabase.rpc("confirm_payment_atomic", {
      p_trip_id: tripId,
      p_payment_id: paymentId,
      p_confirmed_by: confirmedBy,
      p_activity: activityRow,
    });

    if (error) {
      console.warn("RPC confirm_payment_atomic warning, falling back:", error.message);
      const { error: updErr } = await supabase
        .from("payments")
        .update({
          status: "confirmed",
          confirmed_by: confirmedBy,
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId);
      if (updErr) console.warn("Fallback payment update error:", updErr.message);
      if (activity) await addActivityToDatabase(tripId, activity);
    }
  } catch (err) {
    console.warn("Network error in confirmPaymentAtomic, falling back:", err);
    if (activity) await addActivityToDatabase(tripId, activity);
  }
}

export async function addPaymentToDatabase(tripId: string, payment: Payment): Promise<void> {
  if (isClientOffline()) {
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
  if (isClientOffline()) {
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
  if (isClientOffline()) {
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

export async function addMemberToDatabase(tripId: string, member: Member): Promise<Member> {
  if (isClientOffline()) {
    enqueueOfflineMutation("SAVE_MEMBER", tripId, member);
    return member;
  }
  try {
    let resolvedUserId = member.userId;
    // If member has phone or email, check if user is already registered
    const cleanPhone = (member.phone || "").replace(/\D/g, "");
    const cleanEmail = (member.email || "").trim().toLowerCase();

    if (!resolvedUserId || resolvedUserId.startsWith("m_") || resolvedUserId.startsWith("guest_") || resolvedUserId === member.id) {
      if (cleanPhone.length >= 7 || cleanEmail) {
        try {
          const { data: usersList } = await supabase.from("users").select("id, email, phone, name");
          if (Array.isArray(usersList)) {
            const match = usersList.find((u) => {
              if (!u) return false;
              if (isEmailMatch(u.email, member.email)) return true;
              if (isPhoneMatch(u.phone, member.phone)) return true;
              return false;
            });
            if (match) {
              resolvedUserId = match.id;
              if ((!member.name || member.name === "Member" || member.name === "Guest" || member.name === "Traveler") && match.name) {
                member.name = match.name;
              }
            }
          }
        } catch (e) {}
      }
    }

    const enhancedMember: Member = {
      ...member,
      userId: resolvedUserId || member.userId || member.id,
    };

    const row = mapMemberToRow(tripId, enhancedMember);
    const { error } = await supabase.from("trip_members").upsert(row);
    if (error) {
      console.warn("Error adding member to Supabase (queuing offline):", error.message);
      enqueueOfflineMutation("SAVE_MEMBER", tripId, enhancedMember);
    }

    // Update trip member_user_ids array
    if (enhancedMember.userId) {
      try {
        const { data: tripRow } = await supabase.from("trips").select("member_user_ids").eq("id", tripId).maybeSingle();
        if (tripRow) {
          const currentIds = Array.isArray(tripRow.member_user_ids) ? tripRow.member_user_ids : [];
          if (!currentIds.includes(enhancedMember.userId)) {
            await supabase.from("trips").update({
              member_user_ids: Array.from(new Set([...currentIds, enhancedMember.userId])),
              updated_at: new Date().toISOString(),
            }).eq("id", tripId);
          }
        }
      } catch (e) {}
    }
    return enhancedMember;
  } catch (err) {
    console.warn("Network error adding member (queuing offline):", err);
    enqueueOfflineMutation("SAVE_MEMBER", tripId, member);
    return member;
  }
}

export async function updateMemberInDatabase(tripId: string, member: Member): Promise<void> {
  if (isClientOffline()) {
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
  if (isClientOffline()) {
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
  if (isClientOffline()) {
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
    role: "admin",
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
    role: "admin",
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
      role: "participant",
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

/**
 * Validates and retrieves trip preview by its invite code.
 * Uses secure Postgres SECURITY DEFINER stored procedure (RPC) so non-members
 * can preview the trip without violating Row Level Security.
 */
export async function getTripByInviteCode(
  inviteCode: string
): Promise<{ success: boolean; trip?: Trip; error?: string }> {
  const code = (inviteCode || "").trim().toUpperCase();
  if (!code) {
    return { success: false, error: "Please enter an invite code." };
  }

  try {
    const { data, error } = await supabase.rpc("get_trip_by_invite_code", {
      p_invite_code: code,
    });

    if (error) {
      console.warn("Notice in get_trip_by_invite_code RPC:", error.message);
    } else if (data) {
      if (data.success && data.trip) {
        const tripData = data.trip;
        const trip: Trip = {
          id: tripData.id,
          title: tripData.title || "Trip",
          location: tripData.location || tripData.destination || "",
          destination: tripData.destination || tripData.location || "",
          startDate: tripData.startDate || "",
          endDate: tripData.endDate || "",
          currency: tripData.currency || "INR",
          status: tripData.status || "ACTIVE",
          ownerId: tripData.ownerId || "",
          ownerName: tripData.ownerName || "Organizer",
          inviteCode: tripData.inviteCode || code,
          inviteExpiresAt: tripData.inviteExpiresAt || undefined,
          memberUserIds: Array.isArray(tripData.memberUserIds) ? tripData.memberUserIds : [],
          createdAt: tripData.createdAt || new Date().toISOString(),
          members: (tripData.members || []).map((m: any) => ({
            id: m.id,
            userId: m.userId || m.id,
            name: m.name || "Traveler",
            role: m.role || "participant",
            avatarColor: m.avatarColor || "#0F6B65",
            phone: m.phone || "",
            email: m.email || "",
            joinedAt: m.joinedAt || new Date().toISOString(),
            status: "active",
          })),
          expenses: [],
          payments: [],
          activities: [],
        };
        return { success: true, trip };
      }

      if (data.success === false) {
        return {
          success: false,
          error:
            data.message ||
            `Invite code '${code}' is invalid or expired. Please check with your trip organizer.`,
        };
      }
    }
  } catch (err: any) {
    console.warn("Exception calling get_trip_by_invite_code RPC:", err);
  }

  // Fallback: direct query in case RPC is unavailable
  try {
    const { data: tripRows } = await supabase
      .from("trips")
      .select("*")
      .ilike("invite_code", code)
      .limit(1);

    if (tripRows && tripRows.length > 0) {
      const full = await getTripFromDatabase(tripRows[0].id);
      if (full) return { success: true, trip: full };
    }
  } catch (e) {}

  return {
    success: false,
    error: `Invite code '${code}' is invalid or expired. Please check with your trip organizer.`,
  };
}

/**
 * Atomically joins a trip using an invite code and the user's account.
 * Updates trip_members, trips.member_user_ids, and activities in a single atomic transaction.
 */
export async function joinTripByInviteCode(
  inviteCode: string,
  user: UserAccount
): Promise<{ success: boolean; trip?: Trip; alreadyMember?: boolean; error?: string }> {
  const code = (inviteCode || "").trim().toUpperCase();
  if (!code) {
    return { success: false, error: "Please enter an invite code." };
  }
  if (!user || !user.id) {
    return { success: false, error: "Please log in before joining a trip." };
  }

  try {
    const { data, error } = await supabase.rpc("join_trip_by_invite_code", {
      p_invite_code: code,
      p_user: {
        id: user.id,
        userId: user.id,
        name: user.name || "Traveler",
        email: user.email || "",
        phone: user.phone || "",
        avatarColor: user.avatarColor || "#0F6B65",
      },
    });

    if (error) {
      console.warn("Notice calling join_trip_by_invite_code RPC:", error.message);
    } else if (data) {
      if (data.success && data.trip_id) {
        const tripId = data.trip_id;
        const fullTrip = await getTripFromDatabase(tripId);
        if (fullTrip) {
          return {
            success: true,
            trip: fullTrip,
            alreadyMember: Boolean(data.already_member),
          };
        }
        if (data.trip) {
          return {
            success: true,
            trip: {
              ...data.trip,
              expenses: [],
              payments: [],
              activities: [],
            },
            alreadyMember: Boolean(data.already_member),
          };
        }
      }

      if (data.success === false) {
        return {
          success: false,
          error:
            data.message ||
            `Invite code '${code}' is invalid or expired. Please check with your trip organizer.`,
        };
      }
    }
  } catch (err: any) {
    console.warn("Exception in joinTripByInviteCode:", err);
  }

  // Fallback: If RPC encountered a transient issue, try loading preview and member upsert
  try {
    const preview = await getTripByInviteCode(code);
    if (preview.success && preview.trip) {
      const tripId = preview.trip.id;
      const isAlready = (preview.trip.members || []).some(
        (m) => m.id === user.id || m.userId === user.id
      );

      if (isAlready) {
        const full = await getTripFromDatabase(tripId);
        return { success: true, trip: full || preview.trip, alreadyMember: true };
      }

      const newMember: Member = {
        id: user.id,
        userId: user.id,
        name: user.name || "Traveler",
        role: "participant",
        avatarColor: user.avatarColor || "#0F6B65",
        phone: user.phone || "",
        email: user.email || "",
        joinedAt: new Date().toISOString(),
        status: "active",
      };

      await addMemberToDatabase(tripId, newMember);
      const full = await getTripFromDatabase(tripId);
      return { success: true, trip: full || preview.trip, alreadyMember: false };
    }
  } catch (fallbackErr) {
    console.warn("Fallback join error:", fallbackErr);
  }

  return {
    success: false,
    error: `Invite code '${code}' is invalid or expired. Please check with your trip organizer.`,
  };
}

