import React, { useState, useEffect } from "react";
import { useOfflineSync } from "../context/OfflineSyncContext";
import {
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
  Sparkles,
  CloudOff,
  X,
} from "lucide-react";

export function OfflineSyncBanner() {
  const {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncedAt,
    triggerSync,
    needRefresh,
    updateServiceWorker,
  } = useOfflineSync();

  const [dismissSyncNotice, setDismissSyncNotice] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [prevPending, setPrevPending] = useState(pendingCount);

  // Detect transition from pendingCount > 0 to 0 while online
  useEffect(() => {
    if (prevPending > 0 && pendingCount === 0 && isOnline) {
      setJustSynced(true);
      const t = setTimeout(() => setJustSynced(false), 4000);
      return () => clearTimeout(t);
    }
    setPrevPending(pendingCount);
  }, [pendingCount, isOnline, prevPending]);

  // Format relative last sync
  const formatLastSync = (iso: string | null) => {
    if (!iso) return "Not synced yet";
    try {
      const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (diffSec < 45) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      return `${Math.floor(diffSec / 3600)}h ago`;
    } catch {
      return "Recently";
    }
  };

  // 1. PWA App Update banner
  if (needRefresh) {
    return (
      <div
        id="pwa-update-banner"
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md animate-in fade-in"
        style={{
          backgroundColor: "var(--c-tealDark, #0F6B65)",
          color: "#FFFFFF",
          borderBottom: "1px solid var(--c-teal, #2DD4BF)",
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-300 animate-spin" />
          <span>New TripSplit version available with latest updates!</span>
        </div>
        <button
          type="button"
          onClick={updateServiceWorker}
          className="px-3 py-1 bg-white text-teal-900 rounded-lg text-xs font-bold shadow-xs hover:bg-teal-50 transition cursor-pointer"
        >
          Update Now
        </button>
      </div>
    );
  }

  // 2. Offline Mode Banner
  if (!isOnline) {
    return (
      <aside
        id="pwa-offline-banner"
        aria-label="Offline Mode Notification"
        className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-medium border-b shadow-xs transition-all"
        style={{
          backgroundColor: "var(--c-paperDark, #1E293B)",
          borderColor: "var(--c-line, #334155)",
          color: "var(--c-ink, #F8FAFC)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <WifiOff size={14} className="text-amber-400 shrink-0" />
          <div className="truncate">
            <strong className="font-bold text-amber-400">Offline Mode</strong>
            <span className="hidden sm:inline" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
              {" "}— Expenses & settlements are saved locally and will auto-sync on reconnect.
            </span>
            {pendingCount > 0 && (
              <span
                className="ml-2 inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-bold"
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.18)",
                  color: "#FBBF24",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                {pendingCount} offline {pendingCount === 1 ? "change" : "changes"}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px]" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
            Plane / Hike ready
          </span>
        </div>
      </aside>
    );
  }

  // 3. Just Synced Notification
  if (justSynced && !dismissSyncNotice) {
    return (
      <aside
        id="pwa-synced-banner"
        aria-label="Offline Sync Success"
        className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-medium border-b shadow-xs animate-in slide-in-from-top-1"
        style={{
          backgroundColor: "var(--c-positiveSoft, rgba(34, 197, 94, 0.12))",
          borderColor: "var(--c-positive, #22C55E)",
          color: "var(--c-ink, #F8FAFC)",
        }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          <span>
            <strong className="text-emerald-500 font-bold">Cloud Synced</strong> — All offline
            trip changes have been saved to the database.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissSyncNotice(true)}
          className="p-1 rounded cursor-pointer hover:opacity-75"
          style={{ color: "var(--c-inkSoft, #94A3B8)" }}
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </aside>
    );
  }

  // 4. Pending Unsynced Items while Online (e.g. background sync active or pending manual retry)
  if (pendingCount > 0 && isOnline) {
    return (
      <aside
        id="pwa-pending-sync-banner"
        aria-label="Pending Synchronization"
        className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-medium border-b shadow-xs"
        style={{
          backgroundColor: "var(--c-card, #1E293B)",
          borderColor: "var(--c-line, #334155)",
          color: "var(--c-ink, #F8FAFC)",
        }}
      >
        <div className="flex items-center gap-2">
          <RefreshCw
            size={13}
            className={`text-teal-500 ${isSyncing ? "animate-spin" : ""}`}
          />
          <span>
            {isSyncing
              ? `Syncing ${pendingCount} offline change${pendingCount > 1 ? "s" : ""} to cloud...`
              : `${pendingCount} offline change${pendingCount > 1 ? "s" : ""} waiting to sync.`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={triggerSync}
            disabled={isSyncing}
            className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-opacity cursor-pointer hover:opacity-85"
            style={{
              backgroundColor: "var(--c-teal, #0F6B65)",
              color: "var(--c-teal-contrast-text, #FFFFFF)",
            }}
          >
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </aside>
    );
  }

  return null;
}
