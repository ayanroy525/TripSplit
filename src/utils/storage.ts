import { Trip, Expense, Payment, Member, Activity, UserAccount } from "../types";
import {
  enqueueMutation,
  getAuthHeaders,
  getApiUrl,
  handleApiUnauthorized,
  notifyTripMutated,
} from "./offlineSync";

const STORAGE_KEY_PREFIX = "trip_expense_splitter_state_v5_";
const LEGACY_STORAGE_KEY = "trip_expense_splitter_state_v4";

export interface AppState {
  trips: Trip[];
  activeTripId: string;
  currentUserId: string;
}

// ============================================================================
// Row Mappers: PostgreSQL Relational Schema <-> TypeScript Domain Objects
// ============================================================================

function mapTripToRow(trip: Trip, fallbackInviteCode?: string) {
  const memberUserIds = Array.from(
    new Set(
      [
        trip.ownerId,
        ...(trip.memberUserIds || []),
        ...(trip.members || []).map((m) => m.userId || m.id),
      ].filter(Boolean)
    )
  );

  return {
    id: trip.id,
    title: trip.title || "Untitled Trip",
    location: trip.location || trip.destination || "Destination",
    destination: trip.destination || trip.location || "Destination",
    start_date: trip.startDate || new Date().toISOString().split("T")[0],
    end_date: trip.endDate || new Date().toISOString().split("T")[0],
    currency: trip.currency || "INR",
    status: trip.status || "ACTIVE",
    owner_id: trip.ownerId || "",
    owner_name: trip.ownerName || "Traveler",
    member_user_ids: memberUserIds,
    invite_code:
      trip.inviteCode ||
      fallbackInviteCode ||
      `TRIP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    updated_at: new Date().toISOString(),
  };
}

function mapMemberToRow(tripId: string, m: Member) {
  return {
    id: m.id,
    trip_id: tripId,
    user_id: m.userId || m.id,
    name: m.name || "Member",
    role: m.role || "participant",
    avatar_color: m.avatarColor || "#0F6B65",
    phone: m.phone || null,
    email: m.email || null,
    joined_at: m.joinedAt || new Date().toISOString(),
    status: m.status || "active",
  };
}

function mapRowToMember(row: any): Member {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id || row.id,
    name: row.name || "Member",
    role: row.role || "participant",
    avatarColor: row.avatar_color || "#0F6B65",
    phone: row.phone || undefined,
    email: row.email || undefined,
    joinedAt: row.joined_at || new Date().toISOString(),
    status: row.status || "active",
  };
}

function mapExpenseToRow(tripId: string, e: Expense) {
  return {
    id: e.id,
    trip_id: tripId,
    title: e.title || "Expense",
    amount: Number(e.amount) || 0,
    category: e.category || "General",
    date: e.date || new Date().toISOString().split("T")[0],
    paid_by: e.paidBy,
    payers: e.payers || null,
    created_by: e.createdBy || e.paidBy,
    method: e.method || "equal",
    split_type: e.splitType || e.method || "equal",
    participants: Array.isArray(e.participants) ? e.participants : [],
    splits: e.splits || {},
    split_percentages: e.splitPercentages || null,
    split_shares: e.splitShares || null,
    items: e.items || null,
    audit_logs: e.auditLogs || [],
    notes: e.notes || null,
    receipt_url: e.receiptUrl || null,
    original_amount: e.originalAmount ?? null,
    original_currency: e.currency ?? null,
    exchange_rate: e.exchangeRate ?? null,
    deleted: Boolean(e.deleted),
    deleted_at: e.deletedAt || null,
    updated_at: new Date().toISOString(),
  };
}

function mapRowToExpense(row: any): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title || "Expense",
    amount: Number(row.amount) || 0,
    category: row.category || "General",
    date: row.date || new Date().toISOString().split("T")[0],
    paidBy: row.paid_by,
    payers: row.payers || undefined,
    createdBy: row.created_by || row.paid_by,
    method: row.method || "equal",
    splitType: row.split_type || row.method || "equal",
    participants: Array.isArray(row.participants) ? row.participants : [],
    splits: row.splits || {},
    splitPercentages: row.split_percentages || undefined,
    splitShares: row.split_shares || undefined,
    items: Array.isArray(row.items) ? row.items : undefined,
    auditLogs: Array.isArray(row.audit_logs) ? row.audit_logs : undefined,
    notes: row.notes || undefined,
    receiptUrl: row.receipt_url || undefined,
    originalAmount: row.original_amount != null ? Number(row.original_amount) : undefined,
    currency: row.original_currency || undefined,
    exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at || undefined,
  };
}

function mapPaymentToRow(tripId: string, p: Payment) {
  return {
    id: p.id,
    trip_id: tripId,
    from_member_id: p.from,
    to_member_id: p.to,
    from_user_id: p.fromUserId || p.from,
    to_user_id: p.toUserId || p.to,
    amount: Number(p.amount) || 0,
    status: p.status || "confirmed",
    method: p.method || "Cash",
    note: p.note || null,
    original_amount: p.originalAmount ?? null,
    original_currency: p.currency ?? null,
    exchange_rate: p.exchangeRate ?? null,
    confirmed_by: p.confirmedBy || null,
    confirmed_at: p.confirmedAt || null,
    cancelled_by: p.cancelledBy || null,
    cancelled_at: p.cancelledAt || null,
    audit_logs: p.auditLogs || [],
    updated_at: new Date().toISOString(),
  };
}

function mapRowToPayment(row: any): Payment {
  return {
    id: row.id,
    settlementId: row.id,
    tripId: row.trip_id,
    from: row.from_member_id,
    to: row.to_member_id,
    fromUserId: row.from_user_id || row.from_member_id,
    toUserId: row.to_user_id || row.to_member_id,
    amount: Number(row.amount) || 0,
    status: row.status || "confirmed",
    method: row.method || "Cash",
    ts: row.created_at ? new Date(row.created_at).toLocaleDateString() : "Just now",
    note: row.note || undefined,
    originalAmount: row.original_amount != null ? Number(row.original_amount) : undefined,
    currency: row.original_currency || undefined,
    exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : undefined,
    createdAt: row.created_at || new Date().toISOString(),
    confirmedAt: row.confirmed_at || undefined,
    confirmedBy: row.confirmed_by || undefined,
    cancelledAt: row.cancelled_at || undefined,
    cancelledBy: row.cancelled_by || undefined,
    auditLogs: Array.isArray(row.audit_logs) ? row.audit_logs : undefined,
  };
}

function mapActivityToRow(tripId: string, a: Activity) {
  return {
    id: a.id,
    trip_id: tripId,
    ts: a.ts || "Just now",
    user_name: a.user || "Traveler",
    action: a.action || "",
    detail: a.detail || "",
    actor_id: a.actorId || null,
  };
}

function mapRowToActivity(row: any): Activity {
  return {
    id: row.id,
    ts: row.ts || "Just now",
    user: row.user_name || "Traveler",
    action: row.action || "",
    detail: row.detail || "",
    actorId: row.actor_id || undefined,
  };
}

// ============================================================================
// Server-Mediated Database Operations (/api/*)
// ============================================================================

/**
 * Save or update an entire trip document across relational tables via POST /api/trips
 */
export async function saveTripToDatabase(trip: Trip): Promise<void> {
  if (!trip || !trip.id) return;

  try {
    const res = await fetch(getApiUrl("/api/trips"), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(trip),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_TRIP_SNAPSHOT", trip.id, trip);
      }
      return;
    }

    notifyTripMutated(trip.id);
  } catch (err) {
    console.warn("Network error saving trip to server API, queueing offline mutation:", err);
    enqueueMutation("SAVE_TRIP_SNAPSHOT", trip.id, trip);
  }
}

/**
 * Fetch a single trip by ID from GET /api/trips/:tripId
 */
export async function getTripFromDatabase(tripId: string): Promise<Trip | null> {
  if (!tripId) return null;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}`), {
      method: "GET",
      credentials: "include",
      headers: getAuthHeaders(false),
    });

    if (handleApiUnauthorized(res)) {
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await res.json();
      if (json.success && json.trip) {
        return mapServerTripToClientTrip(json.trip);
      }
    }
  } catch (err) {
    console.warn("Error fetching trip from /api/trips/:tripId:", err);
  }

  return null;
}

export const getTripFromFirestore = getTripFromDatabase;

/**
 * Fetch all trips for the authenticated user from GET /api/user-trips
 */
export async function getAllTripsFromDatabase(): Promise<Trip[]> {
  try {
    const res = await fetch(getApiUrl("/api/user-trips"), {
      method: "GET",
      credentials: "include",
      headers: getAuthHeaders(false),
    });

    if (handleApiUnauthorized(res)) {
      return [];
    }

    if (!res.ok) {
      return [];
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await res.json();
      if (json.success && Array.isArray(json.trips)) {
        return json.trips.map((t: any) => mapServerTripToClientTrip(t));
      }
    }
  } catch (err) {
    console.warn("Error fetching trips from /api/user-trips:", err);
  }

  return [];
}

export const getAllTripsFromFirestore = getAllTripsFromDatabase;

/**
 * Poll a specific trip document every 12 seconds while the tab is visible,
 * plus refetch immediately on visibilitychange or after any mutation.
 */
export function subscribeToTrip(
  tripId: string,
  onTripUpdate: (trip: Trip | null) => void,
  onError?: (err: Error) => void
): () => void {
  if (!tripId) return () => {};

  let isDisposed = false;
  let isFetching = false;

  const fetchLatest = async () => {
    if (isDisposed || isFetching) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    isFetching = true;
    try {
      const trip = await getTripFromDatabase(tripId);
      if (!isDisposed) {
        onTripUpdate(trip);
      }
    } catch (err: any) {
      if (!isDisposed && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      isFetching = false;
    }
  };

  fetchLatest();

  const pollTimer = setInterval(fetchLatest, 12000);

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      fetchLatest();
    }
  };

  const onTripMutated = (e: Event) => {
    const customEvent = e as CustomEvent<{ tripId?: string }>;
    if (!customEvent.detail?.tripId || customEvent.detail.tripId === tripId) {
      fetchLatest();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("tripsplit:trip-mutated", onTripMutated);
  }

  return () => {
    isDisposed = true;
    clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("tripsplit:trip-mutated", onTripMutated);
    }
  };
}

/**
 * Helper to check if a user is authorized to view/access a trip
 */
export function isUserAuthorizedForTrip(trip: Trip, userId: string): boolean {
  if (!trip || !userId) return false;
  if (trip.ownerId === userId) return true;
  if (Array.isArray(trip.memberUserIds) && trip.memberUserIds.includes(userId)) return true;
  if (Array.isArray(trip.members) && trip.members.some((m) => m.id === userId || m.userId === userId)) return true;
  return false;
}

/**
 * Helper to normalize phone numbers for comparison
 */
function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

export function isPhoneMatch(phoneA?: string | null, phoneB?: string | null): boolean {
  const cleanA = normalizePhone(phoneA);
  const cleanB = normalizePhone(phoneB);
  if (cleanA.length < 7 || cleanB.length < 7) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.length >= 10 && cleanB.length >= 10) {
    return cleanA.slice(-10) === cleanB.slice(-10);
  }
  return false;
}

export function isEmailMatch(emailA?: string | null, emailB?: string | null): boolean {
  if (!emailA || !emailB) return false;
  const cleanA = emailA.trim().toLowerCase();
  const cleanB = emailB.trim().toLowerCase();
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB;
}

/**
 * Smart User-Member Linking:
 * Automatically links an authenticated user to any trip_members rows via POST /api/trips/link-members
 */
export async function linkUserToExistingTripMembers(
  user: UserAccount
): Promise<{ linkedTripsCount: number; linkedMembersCount: number }> {
  if (!user || !user.id || user.id.startsWith("guest_")) {
    return { linkedTripsCount: 0, linkedMembersCount: 0 };
  }

  const cleanUserPhone = normalizePhone(user.phone);
  const cleanUserEmail = user.email ? user.email.trim().toLowerCase() : "";

  if (!cleanUserPhone && !cleanUserEmail) {
    return { linkedTripsCount: 0, linkedMembersCount: 0 };
  }

  try {
    const res = await fetch(getApiUrl("/api/trips/link-members"), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        name: user.name,
        email: cleanUserEmail,
        phone: user.phone || "",
      }),
    });

    if (handleApiUnauthorized(res)) {
      return { linkedTripsCount: 0, linkedMembersCount: 0 };
    }

    if (res.ok) {
      const data = await res.json();
      const linkedTripsCount = Number(data?.linkedTripsCount || 0);
      const linkedMembersCount = Number(data?.linkedMembersCount || 0);
      if (linkedMembersCount > 0) {
        notifyTripMutated();
      }
      return { linkedTripsCount, linkedMembersCount };
    }
  } catch (err) {
    console.warn("Error in linkUserToExistingTripMembers:", err);
  }

  return { linkedTripsCount: 0, linkedMembersCount: 0 };
}

/**
 * Poll trips belonging to a specific user via GET /api/user-trips every 12 seconds
 * while the tab is visible, plus refetch immediately on visibilitychange or mutation.
 */
export function subscribeToUserTrips(
  userId: string,
  onTripsUpdate: (trips: Trip[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!userId || userId.startsWith("guest_")) {
    if (!userId) onTripsUpdate([]);
    return () => {};
  }

  let isDisposed = false;
  let isFetching = false;

  const fetchUserTrips = async () => {
    if (isDisposed || isFetching) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    isFetching = true;
    try {
      const apiRes = await fetch(
        getApiUrl("/api/user-trips"),
        {
          credentials: "include",
          headers: getAuthHeaders(false),
        }
      );

      if (handleApiUnauthorized(apiRes)) {
        return;
      }

      if (apiRes.ok) {
        const ct = apiRes.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const json = await apiRes.json();
          if (json.success && Array.isArray(json.trips)) {
            const mappedTrips: Trip[] = json.trips.map((t: any) => mapServerTripToClientTrip(t));
            if (!isDisposed) {
              onTripsUpdate(mappedTrips);
            }
            return;
          }
        }
      }
    } catch (err: any) {
      console.warn("Notice in subscribeToUserTrips, using local cache:", err);
      const cached = loadUserLocalState(userId);
      if (!isDisposed && cached.trips && cached.trips.length > 0) {
        onTripsUpdate(cached.trips);
      } else if (!isDisposed && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      isFetching = false;
    }
  };

  fetchUserTrips();

  const pollTimer = setInterval(fetchUserTrips, 12000);

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      fetchUserTrips();
    }
  };

  const onTripMutated = () => {
    fetchUserTrips();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("tripsplit:trip-mutated", onTripMutated);
  }

  return () => {
    isDisposed = true;
    clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("tripsplit:trip-mutated", onTripMutated);
    }
  };
}

/**
 * Poll all trips via GET /api/user-trips every 12 seconds while tab is visible
 */
export function subscribeToAllTrips(
  onTripsUpdate: (trips: Trip[]) => void,
  onError?: (err: Error) => void
): () => void {
  let isDisposed = false;
  let isFetching = false;

  const refresh = async () => {
    if (isDisposed || isFetching) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    isFetching = true;
    try {
      const trips = await getAllTripsFromDatabase();
      if (!isDisposed) {
        onTripsUpdate(trips);
      }
    } catch (err: any) {
      if (!isDisposed && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      isFetching = false;
    }
  };

  refresh();

  const pollTimer = setInterval(refresh, 12000);

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      refresh();
    }
  };

  const onTripMutated = () => {
    refresh();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("tripsplit:trip-mutated", onTripMutated);
  }

  return () => {
    isDisposed = true;
    clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("tripsplit:trip-mutated", onTripMutated);
    }
  };
}

// ============================================================================
// Granular Entity Mutations via Server API (/api/trips/:tripId/*)
// ============================================================================

export async function addExpenseToDatabase(tripId: string, expense: Expense): Promise<void> {
  if (!tripId || !expense) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/expenses`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(expense),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_EXPENSE", tripId, expense);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error adding expense, queueing offline mutation:", err);
    enqueueMutation("SAVE_EXPENSE", tripId, expense);
  }
}

export async function updateExpenseInDatabase(tripId: string, expense: Expense): Promise<void> {
  if (!tripId || !expense) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expense.id)}`),
      {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify(expense),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_EXPENSE", tripId, expense);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error updating expense, queueing offline mutation:", err);
    enqueueMutation("SAVE_EXPENSE", tripId, expense);
  }
}

export async function deleteExpenseFromDatabase(tripId: string, expenseId: string): Promise<void> {
  if (!tripId || !expenseId) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}`),
      {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ expenseId }),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("DELETE_EXPENSE", tripId, { expenseId });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error deleting expense, queueing offline mutation:", err);
    enqueueMutation("DELETE_EXPENSE", tripId, { expenseId });
  }
}

/**
 * Atomic Expense + Activity Persistence via POST /api/trips/:tripId/expenses
 */
export async function saveExpenseAtomic(
  tripId: string,
  expense: Expense,
  activity?: Activity
): Promise<void> {
  if (!tripId || !expense) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/expenses`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        ...expense,
        activity,
      }),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_EXPENSE", tripId, { ...expense, activity });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error in saveExpenseAtomic, queueing offline mutation:", err);
    enqueueMutation("SAVE_EXPENSE", tripId, { ...expense, activity });
  }
}

/**
 * Atomic Payment Settlement + Activity Persistence via POST /api/trips/:tripId/payments
 */
export async function recordPaymentAtomic(
  tripId: string,
  payment: Payment,
  activity?: Activity
): Promise<void> {
  if (!tripId || !payment) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        ...payment,
        activity,
      }),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("RECORD_PAYMENT", tripId, { ...payment, activity });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error in recordPaymentAtomic, queueing offline mutation:", err);
    enqueueMutation("RECORD_PAYMENT", tripId, { ...payment, activity });
  }
}

/**
 * Atomic Payment Confirmation + Activity Persistence via PUT /api/trips/:tripId/payments/:paymentId
 */
export async function confirmPaymentAtomic(
  tripId: string,
  paymentId: string,
  confirmedBy: string,
  activity?: Activity
): Promise<void> {
  if (!tripId || !paymentId) return;

  const payload = {
    id: paymentId,
    status: "confirmed",
    confirmedBy,
    confirmedAt: new Date().toISOString(),
    activity,
  };

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments/${encodeURIComponent(paymentId)}`),
      {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("RECORD_PAYMENT", tripId, payload);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error in confirmPaymentAtomic, queueing offline mutation:", err);
    enqueueMutation("RECORD_PAYMENT", tripId, payload);
  }
}

export async function addPaymentToDatabase(tripId: string, payment: Payment): Promise<void> {
  if (!tripId || !payment) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(payment),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("RECORD_PAYMENT", tripId, payment);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error adding payment, queueing offline mutation:", err);
    enqueueMutation("RECORD_PAYMENT", tripId, payment);
  }
}

export async function updatePaymentInDatabase(tripId: string, payment: Payment): Promise<void> {
  if (!tripId || !payment) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments/${encodeURIComponent(payment.id)}`),
      {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify(payment),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("RECORD_PAYMENT", tripId, payment);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error updating payment, queueing offline mutation:", err);
    enqueueMutation("RECORD_PAYMENT", tripId, payment);
  }
}

export async function deletePaymentFromDatabase(tripId: string, paymentId: string): Promise<void> {
  if (!tripId || !paymentId) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments/${encodeURIComponent(paymentId)}`),
      {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ paymentId }),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("DELETE_PAYMENT", tripId, { paymentId });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error deleting payment, queueing offline mutation:", err);
    enqueueMutation("DELETE_PAYMENT", tripId, { paymentId });
  }
}

export async function addMemberToDatabase(tripId: string, member: Member): Promise<Member> {
  if (!tripId || !member) return member;

  const fallbackMember: Member = {
    ...member,
    userId: member.userId || member.id,
  };

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/trip_members`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(fallbackMember),
    });

    if (handleApiUnauthorized(res)) {
      return fallbackMember;
    }

    if (res.ok) {
      const data = await res.json();
      notifyTripMutated(tripId);
      if (data?.member) {
        return {
          ...fallbackMember,
          ...data.member,
          userId: data.member.userId || data.member.user_id || fallbackMember.userId,
        };
      }
      return fallbackMember;
    }

    if (res.status >= 500) {
      enqueueMutation("SAVE_MEMBER", tripId, fallbackMember);
    }
  } catch (err) {
    console.warn("Network error adding member, queueing offline mutation:", err);
    enqueueMutation("SAVE_MEMBER", tripId, fallbackMember);
  }

  return fallbackMember;
}

export async function updateMemberInDatabase(tripId: string, member: Member): Promise<void> {
  if (!tripId || !member) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/trip_members/${encodeURIComponent(member.id)}`),
      {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify(member),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_MEMBER", tripId, member);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error updating member, queueing offline mutation:", err);
    enqueueMutation("SAVE_MEMBER", tripId, member);
  }
}

export async function deleteMemberFromDatabase(tripId: string, memberId: string): Promise<void> {
  if (!tripId || !memberId) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/trip_members/${encodeURIComponent(memberId)}`),
      {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ memberId }),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("DELETE_MEMBER", tripId, { memberId });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error deleting member, queueing offline mutation:", err);
    enqueueMutation("DELETE_MEMBER", tripId, { memberId });
  }
}

export async function addActivityToDatabase(tripId: string, activity: Activity): Promise<void> {
  if (!tripId || !activity) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/activities`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(activity),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_ACTIVITY", tripId, activity);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error adding activity, queueing offline mutation:", err);
    enqueueMutation("SAVE_ACTIVITY", tripId, activity);
  }
}

export async function deleteTripFromDatabase(tripId: string): Promise<void> {
  if (!tripId) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}`), {
      method: "DELETE",
      credentials: "include",
      headers: getAuthHeaders(false),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("DELETE_TRIP", tripId, { tripId });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error deleting trip, queueing offline mutation:", err);
    enqueueMutation("DELETE_TRIP", tripId, { tripId });
  }
}

// Legacy alias exports for compatibility
export const saveTripToFirestore = saveTripToDatabase;
export const addExpenseToFirestore = addExpenseToDatabase;
export const updateExpenseInFirestore = updateExpenseInDatabase;
export const deleteExpenseFromFirestore = deleteExpenseFromDatabase;
export const addPaymentToFirestore = addPaymentToDatabase;
export const updatePaymentInFirestore = updatePaymentInDatabase;
export const deletePaymentFromFirestore = deletePaymentFromDatabase;
export const addMemberToFirestore = addMemberToDatabase;
export const updateMemberInFirestore = updateMemberInDatabase;
export const deleteMemberFromFirestore = deleteMemberFromDatabase;
export const addActivityToFirestore = addActivityToDatabase;
export const deleteTripFromFirestore = deleteTripFromDatabase;

// Keep row mapper references used by any diagnostic helpers
export {
  mapTripToRow,
  mapMemberToRow,
  mapExpenseToRow,
  mapPaymentToRow,
  mapActivityToRow,
};

// ============================================================================
// LocalStorage Read-Only Offline Cache (Namespaced per User ID)
// ============================================================================

export function loadUserLocalState(userId: string): { trips: Trip[]; activeTripId: string } {
  if (!userId || typeof window === "undefined") {
    return { trips: [], activeTripId: "" };
  }

  try {
    const userStorageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    const raw = localStorage.getItem(userStorageKey);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trips)) {
        const authorizedTrips = parsed.trips.filter((t: Trip) => isUserAuthorizedForTrip(t, userId));
        return {
          trips: authorizedTrips,
          activeTripId: parsed.activeTripId || (authorizedTrips[0]?.id ?? ""),
        };
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (parsed && Array.isArray(parsed.trips)) {
        const authorizedTrips = parsed.trips.filter((t: Trip) => isUserAuthorizedForTrip(t, userId));
        if (authorizedTrips.length > 0) {
          saveUserLocalState(userId, {
            trips: authorizedTrips,
            activeTripId: authorizedTrips[0].id,
          });
        }
        return {
          trips: authorizedTrips,
          activeTripId: authorizedTrips[0]?.id ?? "",
        };
      }
    }
  } catch (e) {
    console.warn("Could not read user local cache:", e);
  }

  return { trips: [], activeTripId: "" };
}

export function saveUserLocalState(
  userId: string,
  state: { trips: Trip[]; activeTripId: string }
): void {
  if (!userId || typeof window === "undefined") return;

  try {
    const userStorageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    const authorizedTrips = state.trips.filter((t) => isUserAuthorizedForTrip(t, userId));
    localStorage.setItem(
      userStorageKey,
      JSON.stringify({
        trips: authorizedTrips,
        activeTripId: state.activeTripId,
      })
    );
  } catch (e) {
    console.warn("Could not save user local cache:", e);
  }
}

export function clearUserLocalState(userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`);
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (e) {}
}

export function loadState(): AppState {
  if (typeof window === "undefined") {
    return { trips: [], activeTripId: "", currentUserId: "" };
  }
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trips)) {
        return {
          trips: parsed.trips,
          activeTripId: parsed.activeTripId || "",
          currentUserId: parsed.currentUserId || "",
        };
      }
    }
  } catch (e) {}

  return {
    trips: [],
    activeTripId: "",
    currentUserId: "",
  };
}

export function saveState(state: AppState): void {
  if (state.currentUserId) {
    saveUserLocalState(state.currentUserId, {
      trips: state.trips,
      activeTripId: state.activeTripId,
    });
  }
}

export async function exportBackupJSON(trip?: Trip): Promise<void> {
  let dataToExport: any = trip;
  if (!dataToExport) {
    const trips = await getAllTripsFromDatabase();
    dataToExport = { trips };
  }
  const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `splittrip-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportExpensesCSV(trip: Trip): void {
  const activeExpenses = trip.expenses.filter((e) => !e.deleted);
  const memberMap = Object.fromEntries(trip.members.map((m) => [m.id, m.name]));

  const headers = ["Title", "Category", "Date", "Amount", "Currency", "Paid By", "Split Method", "Participants", "Notes"];
  const rows = activeExpenses.map((e) => [
    `"${(e.title || "").replace(/"/g, '""')}"`,
    e.category,
    e.date,
    e.amount.toFixed(2),
    trip.currency,
    `"${(memberMap[e.paidBy] || e.paidBy).replace(/"/g, '""')}"`,
    e.method,
    `"${e.participants.map((id) => memberMap[id] || id).join(", ")}"`,
    `"${(e.notes || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.title.toLowerCase().replace(/\s+/g, "-")}-expenses-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateInviteLink(trip: Trip): string {
  const baseUrl = window.location.origin + window.location.pathname;
  const code = trip.inviteCode || trip.id;
  return `${baseUrl}#join?code=${encodeURIComponent(code)}`;
}

export function generateTripDeepLink(tripId: string): string {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#/trip/${encodeURIComponent(tripId)}`;
}

/**
 * Create a clean, empty trip for a newly authenticated user with zero dummy data
 */
export function createCleanInitialTrip(user: {
  id: string;
  name: string;
  email?: string;
  avatarColor?: string;
  phone?: string;
}): Trip {
  const today = new Date().toISOString().split("T")[0];
  const tripId = `trip_${Date.now()}`;
  const inviteCode = `TRIP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const ownerMember: Member = {
    id: user.id,
    tripId,
    userId: user.id,
    name: user.name || "Traveler",
    role: "admin",
    avatarColor: user.avatarColor || "#0F6B65",
    phone: user.phone,
    email: user.email,
    joinedAt: new Date().toISOString(),
    status: "active",
  };

  const emptyTrip: Trip = {
    id: tripId,
    title: "My New Trip",
    location: "Destination",
    destination: "Destination",
    startDate: today,
    endDate: today,
    currency: "INR",
    status: "ACTIVE",
    ownerId: user.id,
    ownerName: user.name || "Traveler",
    memberUserIds: [user.id],
    inviteCode,
    createdAt: new Date().toISOString(),
    members: [ownerMember],
    expenses: [],
    payments: [],
    activities: [
      {
        id: `act_${Date.now()}`,
        ts: "Just now",
        user: user.name || "Traveler",
        action: "created the trip",
        detail: "My New Trip",
      },
    ],
  };

  saveTripToDatabase(emptyTrip).catch(() => {});
  return emptyTrip;
}

export const DEFAULT_AUTH_USER: UserAccount = {
  id: "user_default",
  name: "Traveler",
  email: "traveler@splittrip.local",
  avatarColor: "#0F6B65",
  createdAt: new Date().toISOString(),
};

export function resetStorageState(
  _mode: "clean_scratch",
  user: UserAccount = DEFAULT_AUTH_USER
): { trips: Trip[]; activeTripId: string } {
  clearUserLocalState(user.id);
  const initialTrip = createCleanInitialTrip(user);
  const freshState = {
    trips: [initialTrip],
    activeTripId: initialTrip.id,
  };
  saveUserLocalState(user.id, freshState);
  return freshState;
}

/**
 * Helper to normalize any invite code or full invite URL into an uppercase code
 */
function normalizeInviteInput(rawInput: string): string {
  let clean = (rawInput || "").trim();
  if (!clean) return "";

  if (clean.includes("code=")) {
    const match = clean.match(/code=([^&?#]+)/i);
    if (match && match[1]) {
      clean = decodeURIComponent(match[1]);
    }
  } else if (clean.includes("join=")) {
    const match = clean.match(/join=([^&?#]+)/i);
    if (match && match[1]) {
      clean = decodeURIComponent(match[1]);
    }
  } else if (clean.startsWith("#join?")) {
    clean = clean.replace("#join?", "");
  }

  return clean.trim().toUpperCase();
}

/**
 * Helper to map a server API trip response into a clean client Trip object
 */
function mapServerTripToClientTrip(rawTrip: any): Trip {
  const tripId = rawTrip.id;
  const members: Member[] = Array.isArray(rawTrip.members)
    ? rawTrip.members.map((m: any) =>
        m.trip_id || m.user_id || m.avatar_color ? mapRowToMember(m) : m
      )
    : [];
  const expenses: Expense[] = Array.isArray(rawTrip.expenses)
    ? rawTrip.expenses.map((e: any) =>
        e.trip_id || e.paid_by || e.split_type ? mapRowToExpense(e) : e
      )
    : [];
  const payments: Payment[] = Array.isArray(rawTrip.payments)
    ? rawTrip.payments.map((p: any) =>
        p.trip_id || p.from_member_id || p.to_member_id ? mapRowToPayment(p) : p
      )
    : [];
  const activities: Activity[] = Array.isArray(rawTrip.activities)
    ? rawTrip.activities.map((a: any) =>
        a.trip_id || a.user_name ? mapRowToActivity(a) : a
      )
    : [];

  const memberUserIds = Array.from(
    new Set(
      [
        rawTrip.ownerId || rawTrip.owner_id,
        ...(Array.isArray(rawTrip.memberUserIds)
          ? rawTrip.memberUserIds
          : Array.isArray(rawTrip.member_user_ids)
          ? rawTrip.member_user_ids
          : []),
        ...members.map((m) => m.userId || m.id),
      ].filter(Boolean)
    )
  );

  return {
    id: tripId,
    title: rawTrip.title || "Untitled Trip",
    location: rawTrip.location || rawTrip.destination || "Destination",
    destination: rawTrip.destination || rawTrip.location || "Destination",
    startDate: rawTrip.startDate || rawTrip.start_date || new Date().toISOString().split("T")[0],
    endDate: rawTrip.endDate || rawTrip.end_date || new Date().toISOString().split("T")[0],
    currency: rawTrip.currency || "INR",
    status: rawTrip.status || "ACTIVE",
    ownerId: rawTrip.ownerId || rawTrip.owner_id || "",
    ownerName: rawTrip.ownerName || rawTrip.owner_name || "Traveler",
    inviteCode: rawTrip.inviteCode || rawTrip.invite_code || "",
    memberUserIds,
    createdAt: rawTrip.createdAt || rawTrip.created_at || new Date().toISOString(),
    members,
    expenses,
    payments,
    activities,
  };
}

export interface InviteTripPreview {
  title: string;
  name: string;
  memberCount: number;
  ownerId?: undefined;
  memberUserIds?: undefined;
  members?: undefined;
}

/**
 * Look up a trip by its invite code via POST /api/trips/invite/lookup.
 * Returns only the trip name/title and memberCount.
 */
export async function getTripByInviteCode(
  rawInput: string
): Promise<{
  success: boolean;
  trip?: InviteTripPreview;
  error?: string;
}> {
  const clean = normalizeInviteInput(rawInput);
  if (!clean) {
    return {
      success: false,
      error: "Please enter an invite code.",
    };
  }

  try {
    const apiRes = await fetch(getApiUrl("/api/trips/invite/lookup"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ inviteCode: clean }),
    });
    const ct = apiRes.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await apiRes.json();
      if (apiRes.ok && json.success && json.trip) {
        return {
          success: true,
          trip: {
            title: json.trip.title || json.trip.name || "Untitled Trip",
            name: json.trip.name || json.trip.title || "Untitled Trip",
            memberCount: Number(json.trip.memberCount ?? 0),
          },
        };
      }
      if (apiRes.status === 404 || apiRes.status === 410 || apiRes.status === 429) {
        return {
          success: false,
          error:
            json.error ||
            `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
        };
      }
    }
  } catch (apiErr) {
    console.warn("Server invite lookup failed:", apiErr);
  }

  return {
    success: false,
    error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
  };
}

/**
 * Atomically join a trip using an invite code via POST /api/trips/invite/join.
 */
export async function joinTripByInviteCode(
  rawInput: string,
  currentUser: UserAccount
): Promise<{
  success: boolean;
  trip?: Trip;
  alreadyMember?: boolean;
  error?: string;
}> {
  const clean = normalizeInviteInput(rawInput);
  if (!clean) {
    return { success: false, error: "Please enter a valid invite code." };
  }
  if (!currentUser || !currentUser.id) {
    return { success: false, error: "Please log in before joining a trip." };
  }

  try {
    const apiRes = await fetch(getApiUrl("/api/trips/invite/join"), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        inviteCode: clean,
        user: {
          id: currentUser.id,
          name: currentUser.name || "Traveler",
          email: currentUser.email || "",
          phone: currentUser.phone || "",
          avatarColor: currentUser.avatarColor || "#0F6B65",
        },
      }),
    });

    if (handleApiUnauthorized(apiRes)) {
      return {
        success: false,
        error: "Your session has expired. Please log in again.",
      };
    }

    const ct = apiRes.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await apiRes.json();
      if (apiRes.ok && json.success && json.trip) {
        const joinedTrip = mapServerTripToClientTrip(json.trip);
        notifyTripMutated(joinedTrip.id);
        return {
          success: true,
          alreadyMember: Boolean(json.alreadyMember),
          trip: joinedTrip,
        };
      }
      if (!apiRes.ok && json.error) {
        return {
          success: false,
          error: json.error,
        };
      }
    }
  } catch (apiErr) {
    console.warn("Server invite join error:", apiErr);
  }

  return {
    success: false,
    error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
  };
}
