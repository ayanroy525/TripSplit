import { Trip, Expense, Payment, Member, Activity } from "../types";
import {
  supabase,
  mapTripToRow,
  mapMemberToRow,
  mapExpenseToRow,
  mapPaymentToRow,
  mapActivityToRow,
} from "./supabaseClient";

export type OfflineMutationType =
  | "SAVE_TRIP_SNAPSHOT"
  | "DELETE_TRIP"
  | "SAVE_EXPENSE"
  | "DELETE_EXPENSE"
  | "RECORD_PAYMENT"
  | "DELETE_PAYMENT"
  | "SAVE_MEMBER"
  | "DELETE_MEMBER";

export interface OfflineMutation {
  id: string;
  type: OfflineMutationType;
  tripId: string;
  timestamp: string;
  retryCount: number;
  payload: any;
}

const OFFLINE_QUEUE_KEY = "tripsplit_offline_sync_queue_v1";
const LAST_SYNC_KEY = "tripsplit_last_sync_timestamp";

/**
 * Returns current pending mutations in queue.
 */
export function getOfflineQueue(): OfflineMutation[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((m) => m && m.id && (m.retryCount || 0) < 3);
    }
    return [];
  } catch (err) {
    console.warn("Failed to load offline queue:", err);
    return [];
  }
}

/**
 * Saves mutations to localStorage queue.
 */
export function saveOfflineQueue(queue: OfflineMutation[]): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    // Trigger custom event for UI reactivity
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("tripsplit:offline-queue-changed", { detail: queue }));
    }
  } catch (err) {
    console.warn("Failed to save offline queue:", err);
  }
}

/**
 * Enqueues a new mutation when offline or when a network request fails.
 */
export function enqueueOfflineMutation(
  type: OfflineMutationType,
  tripId: string,
  payload: any
): OfflineMutation {
  const queue = getOfflineQueue();
  
  // Deduplicate redundant whole-trip snapshots for same tripId
  let filtered = queue;
  if (type === "SAVE_TRIP_SNAPSHOT") {
    filtered = queue.filter(
      (m) => !(m.type === "SAVE_TRIP_SNAPSHOT" && m.tripId === tripId)
    );
  }

  const newMutation: OfflineMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    tripId,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    payload,
  };

  filtered.push(newMutation);
  saveOfflineQueue(filtered);
  return newMutation;
}

/**
 * Removes a mutation from queue by ID.
 */
export function dequeueOfflineMutation(id: string): void {
  const queue = getOfflineQueue();
  const updated = queue.filter((m) => m.id !== id);
  saveOfflineQueue(updated);
}

/**
 * Clears the entire offline sync queue.
 */
export function clearOfflineQueue(): void {
  saveOfflineQueue([]);
}

/**
 * Returns the ISO string of the last successful sync.
 */
export function getLastSyncTime(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

/**
 * Sets the last successful sync timestamp.
 */
export function setLastSyncTime(isoDate?: string): void {
  const time = isoDate || new Date().toISOString();
  localStorage.setItem(LAST_SYNC_KEY, time);
}

/**
 * Directly executes a single mutation against the backend database / Supabase.
 */
async function executeMutation(mutation: OfflineMutation): Promise<void> {
  const { type, tripId, payload } = mutation;

  // 1. First attempt to sync via backend API which connects directly to PostgreSQL
  try {
    let authHeader = "";
    if (typeof localStorage !== "undefined") {
      const token = localStorage.getItem("trip_expense_splitter_auth_token_v1");
      if (token) {
        authHeader = `Bearer ${token}`;
      }
    }

    if (authHeader) {
      const res = await fetch("/api/sync/mutation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ type, tripId, payload }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return;
        }
      }
    }
  } catch (apiErr) {
    // If API route is not available or network error, proceed to Supabase client fallback
  }

  // 2. Supabase direct fallback
  switch (type) {
    case "SAVE_TRIP_SNAPSHOT": {
      const trip: Trip = payload;
      if (!trip || !trip.id) return;

      // 1. Root Trip
      const tripRow = mapTripToRow(trip);
      const { error: tripErr } = await supabase.from("trips").upsert(tripRow);
      if (tripErr) throw new Error(`Trip error: ${tripErr.message}`);

      // 2. Members
      if (trip.members && trip.members.length > 0) {
        const memberRows = trip.members.map((m) => mapMemberToRow(trip.id, m));
        await supabase.from("trip_members").upsert(memberRows);
      }

      // 3. Expenses
      if (trip.expenses && trip.expenses.length > 0) {
        const expenseRows = trip.expenses.map((e) => mapExpenseToRow(trip.id, e));
        await supabase.from("expenses").upsert(expenseRows);
      }

      // 4. Payments
      if (trip.payments && trip.payments.length > 0) {
        const paymentRows = trip.payments.map((p) => mapPaymentToRow(trip.id, p));
        await supabase.from("payments").upsert(paymentRows);
      }

      // 5. Activities
      if (trip.activities && trip.activities.length > 0) {
        const actRows = trip.activities.map((a) => mapActivityToRow(trip.id, a));
        await supabase.from("activities").upsert(actRows);
      }
      break;
    }

    case "DELETE_TRIP": {
      await supabase.from("trips").delete().eq("id", tripId);
      break;
    }

    case "SAVE_EXPENSE": {
      const expense: Expense = payload;
      const row = mapExpenseToRow(tripId, expense);
      const { error } = await supabase.from("expenses").upsert(row);
      if (error) throw new Error(error.message);
      break;
    }

    case "DELETE_EXPENSE": {
      const expenseId: string = payload?.expenseId || payload?.id;
      if (expenseId) {
        const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
        if (error) throw new Error(error.message);
      }
      break;
    }

    case "RECORD_PAYMENT": {
      const payment: any = payload;
      if (!payment || !payment.id) break;

      // Handle partial status update (e.g. from confirmPaymentAtomic)
      if (payment.status && (!payment.amount || !payment.from)) {
        const updatePayload: Record<string, any> = {
          status: payment.status,
          updated_at: new Date().toISOString(),
        };
        if (payment.confirmedBy) {
          updatePayload.confirmed_by = payment.confirmedBy;
          updatePayload.confirmed_at = new Date().toISOString();
        }
        if (payment.cancelledBy) {
          updatePayload.cancelled_by = payment.cancelledBy;
          updatePayload.cancelled_at = new Date().toISOString();
        }
        const { error } = await supabase.from("payments").update(updatePayload).eq("id", payment.id);
        if (error) throw new Error(error.message);
        break;
      }

      const row = mapPaymentToRow(tripId, payment as Payment);
      const { error } = await supabase.from("payments").upsert(row);
      if (error) throw new Error(error.message);
      break;
    }

    case "DELETE_PAYMENT": {
      const paymentId: string = payload?.paymentId || payload?.id;
      if (paymentId) {
        const { error } = await supabase.from("payments").delete().eq("id", paymentId);
        if (error) throw new Error(error.message);
      }
      break;
    }

    case "SAVE_MEMBER": {
      const member: Member = payload;
      const row = mapMemberToRow(tripId, member);
      const { error } = await supabase.from("trip_members").upsert(row);
      if (error) throw new Error(error.message);
      break;
    }

    case "DELETE_MEMBER": {
      const memberId: string = payload?.memberId || payload?.id;
      if (memberId) {
        const { error } = await supabase.from("trip_members").delete().eq("id", memberId);
        if (error) throw new Error(error.message);
      }
      break;
    }

    default:
      console.warn("Unknown mutation type:", type);
  }
}

/**
 * Iterates through all queued mutations in order and sends them to Supabase.
 */
export async function processOfflineQueue(): Promise<{
  successCount: number;
  failedCount: number;
  remainingCount: number;
}> {
  // If browser is offline, abort
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { successCount: 0, failedCount: 0, remainingCount: getOfflineQueue().length };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    setLastSyncTime();
    return { successCount: 0, failedCount: 0, remainingCount: 0 };
  }

  let successCount = 0;
  let failedCount = 0;
  const remaining: OfflineMutation[] = [];
  let isCloudUnreachable = false;

  for (const mutation of queue) {
    if (isCloudUnreachable) {
      remaining.push(mutation);
      continue;
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Failed to fetch: Connection timeout")), 3000)
      );
      await Promise.race([executeMutation(mutation), timeoutPromise]);
      successCount++;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isNetworkErr =
        errMsg.toLowerCase().includes("failed to fetch") ||
        errMsg.toLowerCase().includes("networkerror") ||
        errMsg.toLowerCase().includes("timeout") ||
        errMsg.toLowerCase().includes("abort") ||
        errMsg.toLowerCase().includes("load failed") ||
        errMsg.toLowerCase().includes("enotfound");

      if (isNetworkErr) {
        console.warn(`Sync deferred for mutation ${mutation.id} (${mutation.type}): Cloud backend currently unreachable.`);
        isCloudUnreachable = true;
      } else {
        console.warn(`Notice processing mutation ${mutation.id} (${mutation.type}):`, errMsg);
      }

      failedCount++;
      mutation.retryCount = (mutation.retryCount || 0) + 1;
      // Retain up to 3 retries before dropping
      if (mutation.retryCount < 3) {
        remaining.push(mutation);
      }
    }
  }

  saveOfflineQueue(remaining);
  if (remaining.length === 0) {
    setLastSyncTime();
  }

  return {
    successCount,
    failedCount,
    remainingCount: remaining.length,
  };
}
