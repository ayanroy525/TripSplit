import React from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../context/NotificationContext";

interface NotificationBellProps {
  onClick: () => void;
  showText?: boolean;
}

export function NotificationBell({ onClick, showText = false }: NotificationBellProps) {
  const { unreadCount } = useNotifications();

  return (
    <button
      id="btn-open-notifications"
      type="button"
      onClick={onClick}
      title={
        unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
          : "Notification Center"
      }
      aria-label="Open notifications"
      className={`relative inline-flex items-center justify-center transition-all cursor-pointer shadow-xs hover:opacity-80 active:scale-95 ${
        showText
          ? "px-3 py-1.5 rounded-xl gap-1.5 font-semibold text-xs"
          : "w-9 h-9 rounded-full"
      }`}
      style={{
        backgroundColor: "var(--c-card, #1E293B)",
        border: "1px solid var(--c-line, #334155)",
        color: "var(--c-ink, #F8FAFC)",
      }}
    >
      <div className="relative flex items-center justify-center">
        <Bell
          size={17}
          style={{
            color: unreadCount > 0 ? "var(--c-teal, #2DD4BF)" : "var(--c-ink, #F8FAFC)",
          }}
        />
        {unreadCount > 0 && (
          <span
            className="absolute -top-2 -right-2.5 text-[10px] font-bold min-w-[17px] h-[17px] rounded-full flex items-center justify-center px-1 shadow-xs animate-pulse"
            style={{
              backgroundColor: "var(--c-rust, #F87171)",
              color: "#FFFFFF",
              border: "2px solid var(--c-card, #1E293B)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {showText && (
        <span className="text-xs font-semibold" style={{ color: "var(--c-ink, #F8FAFC)" }}>
          Alerts
        </span>
      )}
    </button>
  );
}
