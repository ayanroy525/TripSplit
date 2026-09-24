import React from "react";
import { useNotifications } from "../context/NotificationContext";
import { C } from "../utils/constants";
import {
  Receipt,
  CheckCircle2,
  UserPlus,
  Bell,
  X,
  ArrowRight,
  TrendingDown,
  Trash2,
  Edit3,
} from "lucide-react";
import { NotificationType, NavTab } from "../types";

interface NotificationToastContainerProps {
  onNavigateTab?: (tab: NavTab) => void;
}

export function NotificationToastContainer({ onNavigateTab }: NotificationToastContainerProps) {
  const { toasts, dismissToast, markAsRead } = useNotifications();

  if (toasts.length === 0) return null;

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case "expense_added":
        return <Receipt size={16} color="#ffffff" />;
      case "expense_updated":
        return <Edit3 size={16} color="#ffffff" />;
      case "expense_deleted":
        return <Trash2 size={16} color="#ffffff" />;
      case "payment_recorded":
      case "payment_confirmed":
        return <CheckCircle2 size={16} color="#ffffff" />;
      case "member_joined":
      case "member_added":
      case "member_updated":
        return <UserPlus size={16} color="#ffffff" />;
      case "debt_reminder":
        return <TrendingDown size={16} color="#ffffff" />;
      default:
        return <Bell size={16} color="#ffffff" />;
    }
  };

  const getBadgeColor = (type: NotificationType) => {
    switch (type) {
      case "expense_added":
        return C.marigoldDark;
      case "expense_updated":
        return "#3B82F6";
      case "expense_deleted":
        return C.rust;
      case "payment_recorded":
      case "payment_confirmed":
        return C.teal;
      case "member_joined":
      case "member_added":
        return "#8B5CF6";
      case "debt_reminder":
        return C.rust;
      default:
        return C.marigoldDark;
    }
  };

  return (
    <div
      id="notification-toast-container"
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 380,
        width: "calc(100vw - 40px)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((item) => {
        const { notification, id } = item;
        const badgeBg = getBadgeColor(notification.type);

        return (
          <div
            key={id}
            id={`toast-${id}`}
            style={{
              pointerEvents: "auto",
              background: C.card,
              border: `1.5px solid ${C.line}`,
              borderRadius: 14,
              padding: "12px 14px",
              boxShadow: "0 12px 30px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08)",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              animation: "toastSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
              backdropFilter: "blur(12px)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Left colored status strip */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: 4,
                background: badgeBg,
              }}
            />

            {/* Icon Circle */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: badgeBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 2,
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.15)",
              }}
            >
              {getIcon(notification.type)}
            </div>

            {/* Body Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: C.ink,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {notification.title}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.inkSoft,
                    background: C.paperDark,
                    padding: "2px 6px",
                    borderRadius: 4,
                    flexShrink: 0,
                  }}
                >
                  {notification.tripTitle}
                </span>
              </div>

              <p
                style={{
                  fontSize: 12,
                  color: C.inkSoft,
                  margin: 0,
                  lineHeight: 1.4,
                  wordBreak: "break-word",
                }}
              >
                {notification.body}
              </p>

              {/* Action Links */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 6,
                }}
              >
                {notification.targetTab && (
                  <button
                    type="button"
                    onClick={() => {
                      markAsRead(notification.id);
                      dismissToast(id);
                      if (onNavigateTab && notification.targetTab) {
                        onNavigateTab(notification.targetTab);
                      }
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: badgeBg,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <span>View in {notification.targetTab}</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Dismiss Close Button */}
            <button
              type="button"
              onClick={() => dismissToast(id)}
              style={{
                background: "none",
                border: "none",
                color: C.inkSoft,
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              title="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
