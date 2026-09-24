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
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to load offline queue:", err);
    return [];
  }
}

/**
 * Saves mutations to localStorage queue.
 */
export function saveOfflineQueue(queue: OfflineMutation[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    // Trigger custom event for UI reactivity
    window.dispatchEvent(new CustomEvent("tripsplit:offline-queue-changed", { detail: queue }));
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
 * Directly executes a single mutation against Supabase.
 */
async function executeMutation(mutation: OfflineMutation): Promise<void> {
  const { type, tripId, payload } = mutation;

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
      const expenseId: string = payload.expenseId;
      const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
      if (error) throw new Error(error.message);
      break;
    }

    case "RECORD_PAYMENT": {
      const payment: Payment = payload;
      const row = mapPaymentToRow(tripId, payment);
      const { error } = await supabase.from("payments").upsert(row);
      if (error) throw new Error(error.message);
      break;
    }

    case "DELETE_PAYMENT": {
      const paymentId: string = payload.paymentId;
      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw new Error(error.message);
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
      const memberId: string = payload.memberId;
      const { error } = await supabase.from("trip_members").delete().eq("id", memberId);
      if (error) throw new Error(error.message);
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

  for (const mutation of queue) {
    try {
      await executeMutation(mutation);
      successCount++;
    } catch (err) {
      console.error(`Failed to process mutation ${mutation.id} (${mutation.type}):`, err);
      failedCount++;
      // Increment retry count
      mutation.retryCount = (mutation.retryCount || 0) + 1;
      // Retain up to 5 retries before dropping corrupt items
      if (mutation.retryCount <= 5) {
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
