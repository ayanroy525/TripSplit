import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AppNotification, NotificationPreferences, NotificationType, NavTab } from "../types";
import { playNotificationChime } from "../utils/notificationSound";

export interface ToastItem {
  id: string;
  notification: AppNotification;
  duration?: number;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  toasts: ToastItem[];
  pushPermission: NotificationPermission | "unsupported";
  preferences: NotificationPreferences;
  isPushSupported: boolean;
  requestPushPermission: () => Promise<boolean>;
  notify: (payload: {
    tripId: string;
    tripTitle: string;
    type: NotificationType;
    title: string;
    body: string;
    actorName: string;
    actorAvatarColor?: string;
    amount?: number;
    currency?: string;
    relatedId?: string;
    targetTab?: NavTab;
    skipPush?: boolean;
    skipToast?: boolean;
  }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  deleteNotification: (id: string) => void;
  dismissToast: (id: string) => void;
  updatePreferences: (patch: Partial<NotificationPreferences>) => void;
  sendTestNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const STORAGE_NOTIFICATIONS_KEY = "splittrip_notifications_v2";
const STORAGE_PREFS_KEY = "splittrip_notification_prefs_v2";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  browserPush: true,
  inAppToasts: true,
  soundEnabled: true,
  notifyOnExpense: true,
  notifyOnSettlement: true,
  notifyOnMember: true,
  notifyOnReminder: true,
  notifyOnCompletion: true,
};

// Initial seed notifications so user immediately sees activity history
const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: "notif_init_1",
    tripId: "trip_puri_2026",
    tripTitle: "Puri Weekend 🌊",
    type: "expense_added",
    title: "New Expense Added",
    body: "Ayan added 'Resort Villa Booking' for ₹14,500",
    actorName: "Ayan",
    actorAvatarColor: "#E39A2D",
    amount: 14500,
    currency: "INR",
    targetTab: "expenses",
    read: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: "notif_init_2",
    tripId: "trip_puri_2026",
    tripTitle: "Puri Weekend 🌊",
    type: "payment_recorded",
    title: "Manual Settlement Recorded",
    body: "Rohit recorded a manual payment of ₹2,400 to Ayan. Waiting for confirmation.",
    actorName: "Rohit",
    actorAvatarColor: "#0F6B65",
    amount: 2400,
    currency: "INR",
    targetTab: "settlement",
    read: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "notif_init_3",
    tripId: "trip_puri_2026",
    tripTitle: "Puri Weekend 🌊",
    type: "member_joined",
    title: "New Member Joined",
    body: "Sneha joined Puri Weekend trip via invite link",
    actorName: "Sneha",
    actorAvatarColor: "#C2543A",
    targetTab: "expenses",
    read: true,
    timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
  },
];

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  // 1. Notification list state
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_NOTIFICATIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore errors
    }
    return INITIAL_NOTIFICATIONS;
  });

  // 2. Preferences state
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFS_KEY);
      if (saved) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore errors
    }
    return DEFAULT_PREFERENCES;
  });

  // 3. Active toasts list
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // 4. Push Permission state
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "unsupported";
  });

  const isPushSupported = pushPermission !== "unsupported";

  // Persist notifications
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify(notifications.slice(0, 100)));
    } catch {
      // Ignore quota errors
    }
  }, [notifications]);

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(preferences));
    } catch {
      // Ignore errors
    }
  }, [preferences]);

  // Sync push permission on mount & visibility change
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Dismiss a specific toast
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Request Push Permission
  const requestPushPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPushPermission("unsupported");
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      return perm === "granted";
    } catch (err) {
      console.warn("Failed to request notification permission:", err);
      return false;
    }
  }, []);

  // Dispatch both in-app and push notification
  const notify = useCallback(
    (payload: {
      tripId: string;
      tripTitle: string;
      type: NotificationType;
      title: string;
      body: string;
      actorName: string;
      actorAvatarColor?: string;
      amount?: number;
      currency?: string;
      relatedId?: string;
      targetTab?: "expenses" | "settlement" | "analytics" | "activity";
      skipPush?: boolean;
      skipToast?: boolean;
    }) => {
      // Check user preferences filter
      if (
        (payload.type.startsWith("expense") && !preferences.notifyOnExpense) ||
        (payload.type.startsWith("payment") && !preferences.notifyOnSettlement) ||
        (payload.type.startsWith("member") && !preferences.notifyOnMember) ||
        (payload.type === "debt_reminder" && !preferences.notifyOnReminder)
      ) {
        return;
      }

      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newNotif: AppNotification = {
        id: notifId,
        tripId: payload.tripId,
        tripTitle: payload.tripTitle,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        actorName: payload.actorName,
        actorAvatarColor: payload.actorAvatarColor || "#E39A2D",
        amount: payload.amount,
        currency: payload.currency || "INR",
        relatedId: payload.relatedId,
        targetTab: payload.targetTab || "expenses",
        read: false,
        timestamp: new Date().toISOString(),
      };

      // 1. Add to In-App notification list
      setNotifications((prev) => [newNotif, ...prev]);

      // 2. Play sound chime if enabled
      if (preferences.soundEnabled) {
        const soundType = payload.type.startsWith("payment")
          ? "success"
          : payload.type === "debt_reminder"
          ? "alert"
          : "default";
        playNotificationChime(soundType);
      }

      // 3. Show In-App Toast banner if enabled
      if (preferences.inAppToasts && !payload.skipToast) {
        const toastId = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        setToasts((prev) => [{ id: toastId, notification: newNotif }, ...prev.slice(0, 4)]);

        // Auto-dismiss toast after 5.5 seconds
        setTimeout(() => {
          dismissToast(toastId);
        }, 5500);
      }

      // 4. Dispatch Browser / Web Push Notification if granted & enabled
      if (
        preferences.browserPush &&
        !payload.skipPush &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const push = new Notification(`SplitTrip • ${payload.title}`, {
            body: `${payload.body}\nTrip: ${payload.tripTitle}`,
            icon: "/favicon.ico",
            badge: "/favicon.ico",
            tag: payload.relatedId || notifId,
            silent: !preferences.soundEnabled,
          });

          push.onclick = () => {
            window.focus();
            push.close();
          };
        } catch (e) {
          console.warn("Browser notification creation failed:", e);
        }
      }
    },
    [preferences, dismissToast]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const updatePreferences = useCallback((patch: Partial<NotificationPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
  }, []);

  // Send a quick test notification to demonstrate push and sound
  const sendTestNotification = useCallback(async () => {
    // If browser push permission not requested yet, prompt
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      await requestPushPermission();
    }

    notify({
      tripId: "demo",
      tripTitle: "Goa Vacation 🌴",
      type: "expense_added",
      title: "Test Push & App Alert 🚀",
      body: "Sneha added 'Dinner & Cocktails' for ₹3,850 (Your share: ₹1,283)",
      actorName: "Sneha",
      actorAvatarColor: "#0F6B65",
      amount: 3850,
      currency: "INR",
      targetTab: "expenses",
    });
  }, [notify, requestPushPermission]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        toasts,
        pushPermission,
        preferences,
        isPushSupported,
        requestPushPermission,
        notify,
        markAsRead,
        markAllAsRead,
        clearAll,
        deleteNotification,
        dismissToast,
        updatePreferences,
        sendTestNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return ctx;
}
