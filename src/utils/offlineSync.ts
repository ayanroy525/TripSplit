export type MutationType =
  | "SAVE_TRIP_SNAPSHOT"
  | "DELETE_TRIP"
  | "SAVE_EXPENSE"
  | "DELETE_EXPENSE"
  | "RECORD_PAYMENT"
  | "DELETE_PAYMENT"
  | "SAVE_MEMBER"
  | "DELETE_MEMBER"
  | "SAVE_ACTIVITY";

export interface QueuedMutation {
  id: string;
  type: MutationType;
  tripId: string;
  payload: any;
  timestamp: number;
  retryCount: number;
  status: "pending" | "syncing" | "failed";
}

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const MUTATION_QUEUE_KEY = "tripsplit_offline_mutation_queue_v1";
const LAST_SYNCED_KEY = "tripsplit_last_synced_at_v1";

type SyncStateListener = (state: SyncState) => void;
const listeners = new Set<SyncStateListener>();

let isSyncingInternal = false;
let lastErrorInternal: string | null = null;

/**
 * Retrieve authorization headers from stored session token
 */
export function getAuthHeaders(includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (typeof window !== "undefined") {
    try {
      const token =
        localStorage.getItem("trip_expense_splitter_auth_token_v1") ||
        localStorage.getItem("tripsplit_auth_token") ||
        localStorage.getItem("token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {}
  } else if (typeof globalThis !== "undefined" && (globalThis as any).__TRIPSPLIT_TEST_AUTH_TOKEN__) {
    headers["Authorization"] = `Bearer ${(globalThis as any).__TRIPSPLIT_TEST_AUTH_TOKEN__}`;
  }
  return headers;
}

/**
 * Resolves relative /api paths for both browser and Node/Vitest environments
 */
export function getApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (typeof process !== "undefined" && (process.env?.VITEST || process.env?.NODE_ENV === "test")) {
    const port = process.env?.PORT || "3000";
    return `http://localhost:${port}${normalizedPath}`;
  }
  if (
    typeof window !== "undefined" &&
    window.location &&
    typeof window.location.origin === "string" &&
    window.location.origin.startsWith("http")
  ) {
    return normalizedPath;
  }
  const port = (typeof process !== "undefined" && process.env?.PORT) || "3000";
  return `http://localhost:${port}${normalizedPath}`;
}

/**
 * Dispatches a global unauthorized event when any API call returns 401 so AuthContext shows an error toast and logs out cleanly
 */
export function handleApiUnauthorized(res: { status?: number } | null | undefined, customMessage?: string): boolean {
  if (res && res.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("tripsplit:unauthorized", {
          detail: {
            message: customMessage || "Your session has expired (401). Please log in again.",
          },
        })
      );
    }
    return true;
  }
  return false;
}

/**
 * Dispatches a trip mutation event so active polling listeners can trigger an immediate refetch
 */
export function notifyTripMutated(tripId?: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("tripsplit:trip-mutated", {
        detail: { tripId },
      })
    );
  }
}

export function getQueuedMutations(): QueuedMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MUTATION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueuedMutations(queue: QueuedMutation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("Could not save offline mutation queue:", e);
  }
  notifyListeners();
}

export function getSyncState(): SyncState {
  const queue = getQueuedMutations();
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  let lastSyncedAt: string | null = null;
  if (typeof window !== "undefined") {
    try {
      lastSyncedAt = localStorage.getItem(LAST_SYNCED_KEY);
    } catch {}
  }

  return {
    isOnline,
    isSyncing: isSyncingInternal,
    pendingCount: queue.length,
    lastSyncedAt,
    lastError: lastErrorInternal,
  };
}

function notifyListeners(): void {
  const state = getSyncState();
  listeners.forEach((cb) => {
    try {
      cb(state);
    } catch {}
  });
}

export function subscribeToSyncState(cb: SyncStateListener): () => void {
  listeners.add(cb);
  cb(getSyncState());
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Enqueue a mutation for resilient background synchronization.
 * Deduplicates consecutive snapshots/updates for the same entity ID.
 */
export function enqueueMutation(
  type: MutationType,
  tripId: string,
  payload: any
): QueuedMutation {
  const queue = getQueuedMutations();

  const existingIdx = queue.findIndex((item) => {
    if (item.tripId !== tripId || item.type !== type) return false;
    if (type === "SAVE_TRIP_SNAPSHOT") return true;
    if (type === "SAVE_EXPENSE" && item.payload?.id === payload?.id) return true;
    if (type === "RECORD_PAYMENT" && item.payload?.id === payload?.id) return true;
    if (type === "SAVE_MEMBER" && item.payload?.id === payload?.id) return true;
    if (type === "SAVE_ACTIVITY" && item.payload?.id === payload?.id) return true;
    return false;
  });

  const mutation: QueuedMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    tripId,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
    status: "pending",
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = mutation;
  } else {
    queue.push(mutation);
  }

  saveQueuedMutations(queue);

  if (typeof navigator === "undefined" || navigator.onLine) {
    flushMutationQueue().catch(() => {});
  }

  return mutation;
}

/**
 * Execute a single queued mutation via the server-mediated /api/sync/mutation endpoint.
 */
async function executeMutation(mutation: QueuedMutation): Promise<boolean> {
  const { type, tripId, payload } = mutation;

  const res = await fetch(getApiUrl("/api/sync/mutation"), {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify({ type, tripId, payload }),
  });

  if (handleApiUnauthorized(res)) {
    return true;
  }

  if (res.ok) {
    notifyTripMutated(tripId);
    return true;
  }

  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    console.warn(`Discarding unauthorized or rejected mutation (${res.status}) for ${type}`);
    return true;
  }

  const errBody = await res.json().catch(() => ({}));
  throw new Error(errBody?.error || `Server sync failed with status ${res.status}`);
}

/**
 * Flush all pending mutations in FIFO order when online.
 */
export async function flushMutationQueue(): Promise<{
  flushed: number;
  remaining: number;
}> {
  if (isSyncingInternal) {
    return { flushed: 0, remaining: getQueuedMutations().length };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    notifyListeners();
    return { flushed: 0, remaining: getQueuedMutations().length };
  }

  const queue = getQueuedMutations();
  if (queue.length === 0) {
    return { flushed: 0, remaining: 0 };
  }

  isSyncingInternal = true;
  lastErrorInternal = null;
  notifyListeners();

  let flushedCount = 0;
  const remainingQueue: QueuedMutation[] = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      await executeMutation(item);
      flushedCount++;
    } catch (err: any) {
      console.warn(`Offline sync retry queued for ${item.type}:`, err?.message || err);
      lastErrorInternal = err?.message || "Sync delayed";
      remainingQueue.push({
        ...item,
        retryCount: (item.retryCount || 0) + 1,
        status: "failed",
      });
      for (let j = i + 1; j < queue.length; j++) {
        remainingQueue.push(queue[j]);
      }
      break;
    }
  }

  if (flushedCount > 0 && typeof window !== "undefined") {
    try {
      localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
    } catch {}
  }

  isSyncingInternal = false;
  saveQueuedMutations(remainingQueue);

  return {
    flushed: flushedCount,
    remaining: remainingQueue.length,
  };
}

export function clearMutationQueue(): void {
  saveQueuedMutations([]);
}

export type OfflineMutationType = MutationType;
export const getOfflineQueue = getQueuedMutations;
export const processOfflineQueue = flushMutationQueue;
export const enqueueOfflineMutation = enqueueMutation;
export const clearOfflineQueue = clearMutationQueue;

export function getLastSyncTime(): string | null {
  return getSyncState().lastSyncedAt;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    notifyListeners();
    flushMutationQueue().catch(() => {});
  });

  window.addEventListener("offline", () => {
    notifyListeners();
  });

  setInterval(() => {
    if (typeof navigator !== "undefined" && navigator.onLine && getQueuedMutations().length > 0) {
      flushMutationQueue().catch(() => {});
    }
  }, 15000);
}
