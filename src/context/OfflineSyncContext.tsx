import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getOfflineQueue,
  processOfflineQueue,
  getLastSyncTime,
  enqueueOfflineMutation,
  clearOfflineQueue,
  OfflineMutationType,
} from "../utils/offlineSync";
import { registerSW } from "virtual:pwa-register";

interface OfflineSyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  triggerSync: () => Promise<void>;
  queueOfflineChange: (type: OfflineMutationType, tripId: string, payload: any) => void;
  clearQueue: () => void;
  needRefresh: boolean;
  updateServiceWorker: () => void;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(undefined);

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(() => getOfflineQueue().length);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(getLastSyncTime());
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSWFn, setUpdateSWFn] = useState<(() => Promise<void>) | null>(null);

  // Register PWA Service Worker with auto update check
  useEffect(() => {
    try {
      const updateSW = registerSW({
        onNeedRefresh() {
          setNeedRefresh(true);
        },
        onOfflineReady() {
          console.log("TripSplit PWA is cached and ready for offline use.");
        },
      });
      setUpdateSWFn(() => updateSW);
    } catch (err) {
      console.warn("PWA Service Worker registration notice:", err);
    }
  }, []);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getOfflineQueue().length);
    setLastSyncedAt(getLastSyncTime());
  }, []);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    setIsSyncing(true);
    try {
      await processOfflineQueue();
      refreshPendingCount();
    } catch (err) {
      console.error("Auto sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  // Network and custom queue change listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueChange = () => {
      refreshPendingCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("tripsplit:offline-queue-changed", handleQueueChange);

    // Initial check: If online and there are pending items, sync them!
    if (navigator.onLine && getOfflineQueue().length > 0) {
      triggerSync();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("tripsplit:offline-queue-changed", handleQueueChange);
    };
  }, [triggerSync, refreshPendingCount]);

  const queueOfflineChange = useCallback(
    (type: OfflineMutationType, tripId: string, payload: any) => {
      enqueueOfflineMutation(type, tripId, payload);
      refreshPendingCount();
      if (isOnline) {
        triggerSync();
      }
    },
    [isOnline, refreshPendingCount, triggerSync]
  );

  const clearQueue = useCallback(() => {
    clearOfflineQueue();
    refreshPendingCount();
  }, [refreshPendingCount]);

  const updateServiceWorker = useCallback(() => {
    if (updateSWFn) {
      updateSWFn().catch((err) => console.warn("SW update error:", err));
      setNeedRefresh(false);
    }
  }, [updateSWFn]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        lastSyncedAt,
        triggerSync,
        queueOfflineChange,
        clearQueue,
        needRefresh,
        updateServiceWorker,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error("useOfflineSync must be used within an OfflineSyncProvider");
  }
  return context;
}
