import React, { useState } from "react";
import { useNotifications } from "../context/NotificationContext";
import { NotificationType, Trip } from "../types";
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  Smartphone,
  Sliders,
  Sparkles,
  Receipt,
  CheckCircle2,
  UserPlus,
  TrendingDown,
  ArrowRight,
  Volume2,
  VolumeX,
} from "lucide-react";

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip?: Trip;
  currentUserId?: string;
  onNavigateTab: (tabId: string) => void;
}

export function NotificationCenterModal({
  isOpen,
  onClose,
  onNavigateTab,
}: NotificationCenterModalProps) {
  const {
    notifications,
    unreadCount,
    preferences,
    updatePreferences,
    markAsRead,
    markAllAsRead,
    clearAll,
    deleteNotification,
    pushPermission,
    requestPushPermission,
    sendTestNotification,
    isPushSupported,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<"inbox" | "settings">("inbox");
  const [filterType, setFilterType] = useState<
    "all" | "unread" | "expense" | "settlement" | "member"
  >("all");
  const [dismissedPushBanner, setDismissedPushBanner] = useState(false);
  const [isRequestingPush, setIsRequestingPush] = useState(false);

  // Filter list based on selected chip
  const filteredList = notifications.filter((n) => {
    if (filterType === "unread") return !n.read;
    if (filterType === "expense")
      return (
        n.type === "expense_added" ||
        n.type === "expense_updated" ||
        n.type === "expense_deleted"
      );
    if (filterType === "settlement")
      return (
        n.type === "payment_recorded" ||
        n.type === "payment_confirmed" ||
        n.type === "settlement_requested" ||
        n.type === "settlement_confirmed" ||
        n.type === "settlement_cancelled" ||
        n.type === "debt_reminder"
      );
    if (filterType === "member")
      return (
        n.type === "member_joined" ||
        n.type === "member_added" ||
        n.type === "member_updated"
      );
    return true;
  });

  const handleEnablePush = async () => {
    setIsRequestingPush(true);
    try {
      const granted = await requestPushPermission();
      if (granted) {
        setDismissedPushBanner(true);
      }
    } finally {
      setIsRequestingPush(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const now = Date.now();
      const time = new Date(dateStr).getTime();
      const diff = Math.max(0, Math.floor((now - time) / 1000));

      if (diff < 60) return "Just now";
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return "Recently";
    }
  };

  const getTypeMeta = (type: NotificationType) => {
    switch (type) {
      case "expense_added":
        return {
          icon: <Receipt size={16} className="text-amber-500 dark:text-amber-400" />,
          bg: "bg-amber-500/10 border-amber-500/20",
          accentColor: "#D97706",
          badge: "Expense",
        };
      case "expense_updated":
        return {
          icon: <Receipt size={16} className="text-blue-500 dark:text-blue-400" />,
          bg: "bg-blue-500/10 border-blue-500/20",
          accentColor: "#2563EB",
          badge: "Updated",
        };
      case "expense_deleted":
        return {
          icon: <Trash2 size={16} className="text-rose-500 dark:text-rose-400" />,
          bg: "bg-rose-500/10 border-rose-500/20",
          accentColor: "#DC2626",
          badge: "Deleted",
        };
      case "payment_recorded":
      case "payment_confirmed":
      case "settlement_requested":
      case "settlement_confirmed":
        return {
          icon: <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400" />,
          bg: "bg-emerald-500/10 border-emerald-500/20",
          accentColor: "#059669",
          badge: "Settlement",
        };
      case "member_joined":
      case "member_added":
      case "member_updated":
        return {
          icon: <UserPlus size={16} className="text-purple-500 dark:text-purple-400" />,
          bg: "bg-purple-500/10 border-purple-500/20",
          accentColor: "#7C3AED",
          badge: "Member",
        };
      case "debt_reminder":
        return {
          icon: <TrendingDown size={16} className="text-orange-500 dark:text-orange-400" />,
          bg: "bg-orange-500/10 border-orange-500/20",
          accentColor: "#EA580C",
          badge: "Reminder",
        };
      default:
        return {
          icon: <Bell size={16} className="text-[var(--c-teal)]" />,
          bg: "bg-[var(--c-tealSoft)] border-[var(--c-teal)]/20",
          accentColor: "#0F6B65",
          badge: "Notice",
        };
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="modal-notification-center"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: "var(--c-paper, #0F172A)",
          color: "var(--c-ink, #F8FAFC)",
          borderColor: "var(--c-line, #334155)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between sticky top-0 z-10"
          style={{
            backgroundColor: "var(--c-paper, #0F172A)",
            borderColor: "var(--c-line, #334155)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-xs"
              style={{
                backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.12))",
                color: "var(--c-teal, #0F6B65)",
                borderColor: "var(--c-line, #334155)",
              }}
            >
              <Bell size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className="text-lg font-bold tracking-tight"
                  style={{ color: "var(--c-ink, #F8FAFC)" }}
                >
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border"
                    style={{
                      backgroundColor: "var(--c-rustSoft, rgba(180, 83, 9, 0.15))",
                      color: "var(--c-rust, #D97706)",
                      borderColor: "var(--c-rust, #D97706)",
                    }}
                  >
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p
                className="text-xs font-medium"
                style={{ color: "var(--c-inkSoft, #94A3B8)" }}
              >
                Activity, settlement updates & alerts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {unreadCount > 0 && activeTab === "inbox" && (
              <button
                id="btn-notif-mark-all-read"
                type="button"
                onClick={markAllAsRead}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-transparent transition-colors cursor-pointer hover:opacity-80"
                style={{
                  color: "var(--c-teal, #0F6B65)",
                  backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.12))",
                  borderColor: "var(--c-line, #334155)",
                }}
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}

            <button
              id="btn-close-notif-modal"
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer hover:opacity-80"
              style={{
                color: "var(--c-inkSoft, #94A3B8)",
                backgroundColor: "var(--c-paperDark, #1E293B)",
              }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div
          className="px-5 pt-3 pb-2 border-b flex items-center justify-between gap-2"
          style={{
            backgroundColor: "var(--c-paper, #0F172A)",
            borderColor: "var(--c-line, #334155)",
          }}
        >
          <div
            className="flex items-center p-0.5 rounded-xl text-xs font-medium w-full sm:w-auto border"
            style={{
              backgroundColor: "var(--c-paperDark, #1E293B)",
              borderColor: "var(--c-line, #334155)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("inbox")}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg whitespace-nowrap text-[11.5px] sm:text-xs transition-all cursor-pointer"
              style={{
                backgroundColor:
                  activeTab === "inbox" ? "var(--c-card, #1E293B)" : "transparent",
                color:
                  activeTab === "inbox"
                    ? "var(--c-ink, #F8FAFC)"
                    : "var(--c-inkSoft, #94A3B8)",
                fontWeight: activeTab === "inbox" ? 600 : 500,
              }}
            >
              <Bell
                size={13}
                className="shrink-0"
                style={{
                  color:
                    activeTab === "inbox"
                      ? "var(--c-teal, #0F6B65)"
                      : "var(--c-inkSoft, #94A3B8)",
                }}
              />
              <span>Activity Feed</span>
              {unreadCount > 0 && (
                <span
                  className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: "var(--c-rust, #D97706)" }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg whitespace-nowrap text-[11.5px] sm:text-xs transition-all cursor-pointer"
              style={{
                backgroundColor:
                  activeTab === "settings" ? "var(--c-card, #1E293B)" : "transparent",
                color:
                  activeTab === "settings"
                    ? "var(--c-ink, #F8FAFC)"
                    : "var(--c-inkSoft, #94A3B8)",
                fontWeight: activeTab === "settings" ? 600 : 500,
              }}
            >
              <Sliders
                size={13}
                className="shrink-0"
                style={{
                  color:
                    activeTab === "settings"
                      ? "var(--c-teal, #0F6B65)"
                      : "var(--c-inkSoft, #94A3B8)",
                }}
              />
              <span>Preferences</span>
            </button>
          </div>

          {activeTab === "inbox" && notifications.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs flex items-center gap-1 font-medium transition-colors ml-auto shrink-0 cursor-pointer hover:opacity-80"
              style={{ color: "var(--c-inkSoft, #94A3B8)" }}
              title="Clear all notifications"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear feed</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3"
          style={{ backgroundColor: "var(--c-paper, #0F172A)" }}
        >
          {activeTab === "inbox" && (
            <>
              {/* Optional Push Banner */}
              {pushPermission !== "granted" &&
                isPushSupported &&
                !dismissedPushBanner && (
                  <div
                    className="border rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-xs"
                    style={{
                      backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.12))",
                      borderColor: "var(--c-teal, #0F6B65)",
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: "var(--c-teal, #0F6B65)",
                          color: "var(--c-teal-contrast-text, #FFFFFF)",
                        }}
                      >
                        <Smartphone size={16} />
                      </div>
                      <div className="min-w-0">
                        <h4
                          className="text-xs font-bold leading-snug"
                          style={{ color: "var(--c-ink, #F8FAFC)" }}
                        >
                          Enable Instant Device Alerts
                        </h4>
                        <p
                          className="text-[11px] leading-snug line-clamp-2"
                          style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                        >
                          Get notified when expenses or payments are added
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleEnablePush}
                        disabled={isRequestingPush}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition-opacity cursor-pointer hover:opacity-90"
                        style={{
                          backgroundColor: "var(--c-teal, #0F6B65)",
                          color: "var(--c-teal-contrast-text, #FFFFFF)",
                        }}
                      >
                        {isRequestingPush ? "Prompting..." : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedPushBanner(true)}
                        className="p-1 rounded-md cursor-pointer hover:opacity-80"
                        style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                        title="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none px-1 pr-4">
                {[
                  { id: "all", label: "All", count: notifications.length },
                  { id: "unread", label: "Unread", count: unreadCount },
                  { id: "expense", label: "Expenses" },
                  { id: "settlement", label: "Settlements" },
                  { id: "member", label: "Members" },
                ].map((f) => {
                  const isActive = filterType === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilterType(f.id as any)}
                      className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border cursor-pointer"
                      style={{
                        backgroundColor: isActive
                          ? "var(--c-teal, #0F6B65)"
                          : "var(--c-paperDark, #1E293B)",
                        color: isActive
                          ? "var(--c-teal-contrast-text, #FFFFFF)"
                          : "var(--c-inkSoft, #94A3B8)",
                        borderColor: isActive
                          ? "var(--c-teal, #0F6B65)"
                          : "var(--c-line, #334155)",
                        fontWeight: isActive ? 600 : 500,
                      }}
                    >
                      <span>{f.label}</span>
                      {f.count !== undefined && f.count > 0 && (
                        <span
                          className="text-[10px] px-1.5 py-0.2 rounded-full font-bold"
                          style={{
                            backgroundColor: isActive
                              ? "rgba(0, 0, 0, 0.3)"
                              : "var(--c-line, #334155)",
                            color: isActive
                              ? "#FFFFFF"
                              : "var(--c-ink, #F8FAFC)",
                          }}
                        >
                          {f.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Notification Cards List */}
              {filteredList.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center justify-center">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 border"
                    style={{
                      backgroundColor: "var(--c-paperDark, #1E293B)",
                      borderColor: "var(--c-line, #334155)",
                    }}
                  >
                    <CheckCheck
                      size={22}
                      style={{ color: "var(--c-teal, #0F6B65)" }}
                    />
                  </div>
                  <h3
                    className="text-sm font-bold mb-1"
                    style={{ color: "var(--c-ink, #F8FAFC)" }}
                  >
                    You're all caught up!
                  </h3>
                  <p
                    className="text-xs max-w-xs mb-4"
                    style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                  >
                    {filterType === "unread"
                      ? "No unread notifications right now."
                      : "New activity across your trips will show up here in real time."}
                  </p>
                  <button
                    type="button"
                    onClick={sendTestNotification}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-semibold shadow-xs transition-colors cursor-pointer hover:opacity-90"
                    style={{
                      backgroundColor: "var(--c-paperDark, #1E293B)",
                      borderColor: "var(--c-line, #334155)",
                      color: "var(--c-ink, #F8FAFC)",
                    }}
                  >
                    <Sparkles size={13} className="text-amber-500" />
                    <span>Send Test Notification</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredList.map((n) => {
                    const meta = getTypeMeta(n.type);

                    return (
                      <div
                        key={n.id}
                        id={`notif-item-${n.id}`}
                        onClick={() => {
                          if (!n.read) markAsRead(n.id);
                        }}
                        className="group relative p-3.5 rounded-xl border transition-all cursor-pointer shadow-xs"
                        style={{
                          backgroundColor: !n.read
                            ? "var(--c-card-unread, #172554)"
                            : "var(--c-card, #1E293B)",
                          borderColor: !n.read
                            ? "var(--c-teal, #0F6B65)"
                            : "var(--c-line, #334155)",
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon Container */}
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${meta.bg} shadow-2xs`}
                          >
                            {meta.icon}
                          </div>

                          {/* Main Body */}
                          <div className="flex-1 min-w-0">
                            {/* Top row: Title + unread dot + time */}
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="text-xs font-bold truncate"
                                  style={{
                                    color: !n.read
                                      ? "var(--c-ink, #F8FAFC)"
                                      : "var(--c-inkSoft, #94A3B8)",
                                  }}
                                >
                                  {n.title}
                                </span>
                                {!n.read && (
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: "var(--c-teal, #0F6B65)" }}
                                    title="Unread"
                                  />
                                )}
                              </div>
                              <span
                                className="text-[11px] font-medium shrink-0"
                                style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                              >
                                {formatTimeAgo(n.timestamp)}
                              </span>
                            </div>

                            {/* Message body */}
                            <p
                              className="text-xs leading-relaxed break-words mb-2"
                              style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                            >
                              {n.body}
                            </p>

                            {/* Bottom row: Meta pill + action */}
                            <div
                              className="flex items-center justify-between gap-2 pt-2 border-t text-[11px]"
                              style={{ borderColor: "var(--c-line, #334155)" }}
                            >
                              <div className="flex items-center gap-2 truncate">
                                {/* Actor */}
                                <div className="flex items-center gap-1.5 truncate">
                                  <div
                                    className="w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center shrink-0"
                                    style={{
                                      backgroundColor: n.actorAvatarColor || "#0F6B65",
                                    }}
                                  >
                                    {n.actorName.charAt(0).toUpperCase()}
                                  </div>
                                  <span
                                    className="font-semibold truncate max-w-[90px]"
                                    style={{ color: "var(--c-ink, #F8FAFC)" }}
                                  >
                                    {n.actorName}
                                  </span>
                                </div>

                                <span style={{ color: "var(--c-line, #334155)" }}>•</span>

                                {/* Trip Tag */}
                                <span
                                  className="font-medium truncate max-w-[120px]"
                                  style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                                >
                                  {n.tripTitle}
                                </span>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                {n.targetTab && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(n.id);
                                      if (n.targetTab) onNavigateTab(n.targetTab);
                                      onClose();
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer hover:opacity-80"
                                    style={{
                                      color: "var(--c-teal, #0F6B65)",
                                      backgroundColor:
                                        "var(--c-tealSoft, rgba(15, 107, 101, 0.12))",
                                    }}
                                  >
                                    <span>View</span>
                                    <ArrowRight size={11} />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(n.id);
                                  }}
                                  className="p-1 rounded transition-colors cursor-pointer hover:opacity-80"
                                  style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                                  title="Delete"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "settings" && (
            <div className="space-y-4">
              {/* Push Notifications Card */}
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: "var(--c-paperDark, #1E293B)",
                  borderColor: "var(--c-line, #334155)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.12))",
                        color: "var(--c-teal, #0F6B65)",
                      }}
                    >
                      <Smartphone size={16} />
                    </div>
                    <div>
                      <h4
                        className="text-xs font-bold"
                        style={{ color: "var(--c-ink, #F8FAFC)" }}
                      >
                        Browser Push Notifications
                      </h4>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                      >
                        Device alerts when tab is in background
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.browserPush}
                      onChange={(e) => updatePreferences({ browserPush: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div
                      className="w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
                      style={{
                        backgroundColor: preferences.browserPush
                          ? "var(--c-teal, #0F6B65)"
                          : "var(--c-line, #334155)",
                      }}
                    />
                  </label>
                </div>

                <div
                  className="p-2.5 rounded-lg border flex items-center justify-between text-xs"
                  style={{
                    backgroundColor: "var(--c-card, #1E293B)",
                    borderColor: "var(--c-line, #334155)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        pushPermission === "granted"
                          ? "bg-emerald-500"
                          : pushPermission === "denied"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                      }`}
                    />
                    <span
                      className="font-medium"
                      style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                    >
                      Status:{" "}
                      <strong style={{ color: "var(--c-ink, #F8FAFC)" }}>
                        {pushPermission === "granted"
                          ? "Active & Permitted"
                          : pushPermission === "denied"
                          ? "Blocked by Browser"
                          : "Permission Needed"}
                      </strong>
                    </span>
                  </div>

                  {pushPermission !== "granted" ? (
                    <button
                      type="button"
                      onClick={handleEnablePush}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-opacity cursor-pointer hover:opacity-90"
                      style={{
                        backgroundColor: "var(--c-teal, #0F6B65)",
                        color: "var(--c-teal-contrast-text, #FFFFFF)",
                      }}
                    >
                      Allow Push
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={sendTestNotification}
                      className="px-2.5 py-1 border rounded-md text-[11px] font-semibold transition-colors cursor-pointer hover:opacity-80"
                      style={{
                        backgroundColor: "var(--c-paperDark, #1E293B)",
                        borderColor: "var(--c-line, #334155)",
                        color: "var(--c-ink, #F8FAFC)",
                      }}
                    >
                      Send Test
                    </button>
                  )}
                </div>
              </div>

              {/* Sound & In-App Toasts */}
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: "var(--c-paperDark, #1E293B)",
                  borderColor: "var(--c-line, #334155)",
                }}
              >
                <h4
                  className="text-xs font-bold tracking-tight"
                  style={{ color: "var(--c-ink, #F8FAFC)" }}
                >
                  Display & Sound
                </h4>

                <div className="space-y-2.5">
                  <label
                    className="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors"
                    style={{ backgroundColor: "var(--c-paper, #0F172A)" }}
                  >
                    <div>
                      <div
                        className="text-xs font-semibold"
                        style={{ color: "var(--c-ink, #F8FAFC)" }}
                      >
                        In-App Toast Banners
                      </div>
                      <div
                        className="text-[11px]"
                        style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                      >
                        Show pop-up notification cards on the top-right
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.inAppToasts}
                      onChange={(e) => updatePreferences({ inAppToasts: e.target.checked })}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "var(--c-teal, #0F6B65)" }}
                    />
                  </label>

                  <label
                    className="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors"
                    style={{ backgroundColor: "var(--c-paper, #0F172A)" }}
                  >
                    <div className="flex items-center gap-2">
                      {preferences.soundEnabled ? (
                        <Volume2
                          size={16}
                          style={{ color: "var(--c-teal, #0F6B65)" }}
                        />
                      ) : (
                        <VolumeX
                          size={16}
                          style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                        />
                      )}
                      <div>
                        <div
                          className="text-xs font-semibold"
                          style={{ color: "var(--c-ink, #F8FAFC)" }}
                        >
                          Audio Chimes
                        </div>
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                        >
                          Play soft synthesized tone on new notifications
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.soundEnabled}
                      onChange={(e) => updatePreferences({ soundEnabled: e.target.checked })}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "var(--c-teal, #0F6B65)" }}
                    />
                  </label>
                </div>
              </div>

              {/* Event Type Filters */}
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: "var(--c-paperDark, #1E293B)",
                  borderColor: "var(--c-line, #334155)",
                }}
              >
                <h4
                  className="text-xs font-bold tracking-tight"
                  style={{ color: "var(--c-ink, #F8FAFC)" }}
                >
                  Trigger Notifications For
                </h4>

                <div className="space-y-2">
                  {[
                    {
                      key: "notifyOnExpense" as const,
                      label: "Expenses Added & Edited",
                      desc: "When participants add or adjust trip spending",
                    },
                    {
                      key: "notifyOnSettlement" as const,
                      label: "Payments & Settlements",
                      desc: "When money is transferred or confirmed",
                    },
                    {
                      key: "notifyOnMember" as const,
                      label: "Trip Member Updates",
                      desc: "When members join or change details",
                    },
                    {
                      key: "notifyOnReminder" as const,
                      label: "Payment Reminders & Nudges",
                      desc: "When a debt reminder is requested",
                    },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors"
                      style={{ backgroundColor: "var(--c-paper, #0F172A)" }}
                    >
                      <div>
                        <div
                          className="text-xs font-semibold"
                          style={{ color: "var(--c-ink, #F8FAFC)" }}
                        >
                          {item.label}
                        </div>
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--c-inkSoft, #94A3B8)" }}
                        >
                          {item.desc}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences[item.key]}
                        onChange={(e) =>
                          updatePreferences({ [item.key]: e.target.checked })
                        }
                        className="w-4 h-4 rounded"
                        style={{ accentColor: "var(--c-teal, #0F6B65)" }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t flex items-center justify-between"
          style={{
            backgroundColor: "var(--c-paper, #0F172A)",
            borderColor: "var(--c-line, #334155)",
          }}
        >
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--c-inkSoft, #94A3B8)" }}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                pushPermission === "granted" ? "bg-emerald-500" : "bg-amber-400"
              }`}
            />
            <span>
              Push alerts:{" "}
              <strong style={{ color: "var(--c-ink, #F8FAFC)" }}>
                {pushPermission === "granted" ? "Enabled" : "In-App only"}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer hover:opacity-80"
            style={{
              backgroundColor: "var(--c-paperDark, #1E293B)",
              borderColor: "var(--c-line, #334155)",
              color: "var(--c-ink, #F8FAFC)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
