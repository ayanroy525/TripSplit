import React from "react";
import {
  X,
  MessageCircle,
  UserPlus,
  Users,
  Share2,
  Bell,
  Compass,
  Activity,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Trip, Member, UserAccount } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { AccountSection } from "./trip-more-menu/AccountSection";
import { MenuActionRow } from "./trip-more-menu/MenuActionRow";

interface TripMoreMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip?: Trip | null;
  currentUser: Member | undefined;
  currentUserId: string;
  onSelectUserId: (id: string) => void;
  authUser: UserAccount | null;
  isViewer?: boolean;
  onOpenAddExpense?: () => void;
  onOpenProfile: () => void;
  onOpenAuthPage?: () => void;
  onOpenWhatsAppAlerts: () => void;
  onOpenInviteModal: () => void;
  onOpenMembersModal: () => void;
  onOpenShareModal: () => void;
  onOpenNotificationsModal: () => void;
  onOpenTripsHub: () => void;
  onOpenHealthModal?: () => void;
  onNavigateToAnalytics?: () => void;
  onNavigateToActivity?: () => void;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--c-inkSoft, #6B7280)",
  paddingLeft: 4,
};

const sectionCardStyle: React.CSSProperties = {
  background: "var(--c-card, #FFFFFF)",
  border: "1px solid var(--c-line, #E5E7EB)",
  borderRadius: 16,
  overflow: "hidden",
};

export function TripMoreMenuModal({
  isOpen,
  onClose,
  trip,
  currentUser,
  currentUserId,
  onSelectUserId,
  authUser,
  onOpenProfile,
  onOpenAuthPage,
  onOpenWhatsAppAlerts,
  onOpenInviteModal,
  onOpenMembersModal,
  onOpenShareModal,
  onOpenNotificationsModal,
  onOpenTripsHub,
  onOpenHealthModal,
  onNavigateToAnalytics,
  onNavigateToActivity,
}: TripMoreMenuModalProps) {
  const { logout } = useAuth();

  const handleLogout = () => {
    onClose();
    logout();
    if (onOpenAuthPage) {
      onOpenAuthPage();
    }
  };

  if (!isOpen) return null;

  const runAction = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div
      id="modal-trip-more-menu"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
        animation: "fadeIn 0.15s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "var(--c-paper, #F6F8F7)",
          borderLeft: "1px solid var(--c-line, #E5E7EB)",
          width: "100%",
          maxWidth: 420,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "-12px 0 35px rgba(0, 0, 0, 0.18)",
          animation: "slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--c-line, #E5E7EB)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--c-card, #FFFFFF)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "var(--c-tealSoft, #E6F7F2)",
                color: "var(--c-teal, #0F9F86)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Compass size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "var(--c-ink, #17202A)",
                  margin: 0,
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                }}
              >
                Trip Actions & Tools
              </h2>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--c-inkSoft, #6B7280)",
                  fontWeight: 500,
                  marginTop: 2,
                }}
              >
                {trip ? `${trip.location || trip.title} · ${trip.currency}` : "No Active Trip"}
              </div>
            </div>
          </div>

          <button
            id="btn-close-more-menu"
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--c-line, #E5E7EB)",
              background: "var(--c-paper, #F6F8F7)",
              color: "var(--c-inkSoft, #6B7280)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 18px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <AccountSection
            trip={trip}
            currentUser={currentUser}
            currentUserId={currentUserId}
            onSelectUserId={onSelectUserId}
            authUser={authUser}
            onOpenProfile={onOpenProfile}
            onLogout={handleLogout}
            onClose={onClose}
          />

          {/* SECTION 2: ACTIVE TRIP */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={sectionLabelStyle}>Active Trip</span>

            <div
              style={{
                background: "var(--c-card, #FFFFFF)",
                border: "1px solid var(--c-line, #E5E7EB)",
                borderRadius: 16,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: "var(--c-ink, #17202A)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  🌴 {trip?.title || "No Active Trip"}
                </div>
                <div style={{ fontSize: 12, color: "var(--c-inkSoft, #6B7280)", marginTop: 2 }}>
                  {trip ? `${trip.location} · ${trip.members.length} members` : "No trip selected"}
                </div>
              </div>

              <button
                id="btn-menu-open-trips-hub"
                type="button"
                onClick={runAction(onOpenTripsHub)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--c-line, #E5E7EB)",
                  background: "var(--c-paper, #F6F8F7)",
                  color: "var(--c-ink, #17202A)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "background 0.15s ease",
                }}
              >
                <Compass size={14} color="var(--c-teal, #0F9F86)" />
                <span>Switch Trip</span>
              </button>
            </div>
          </div>

          {/* SECTION 3: GROUP & COMMUNICATION */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={sectionLabelStyle}>Group & Communication</span>
            <div style={sectionCardStyle}>
              <MenuActionRow
                id="btn-menu-open-whatsapp"
                onClick={runAction(onOpenWhatsAppAlerts)}
                icon={<MessageCircle size={18} color="#25D366" />}
                iconBg="#E7F8EE"
                iconColor="#25D366"
                title="WhatsApp Group Alerts"
                subtitle="One-click expense & payment updates"
                showDivider
              />
              <MenuActionRow
                id="btn-menu-open-invite"
                onClick={runAction(onOpenInviteModal)}
                icon={<UserPlus size={18} />}
                iconBg="var(--c-tealSoft, #E6F7F2)"
                iconColor="var(--c-teal, #0F9F86)"
                title="Invite Friends"
                subtitle="Share trip link or QR code"
                showDivider
              />
              <MenuActionRow
                id="btn-menu-open-members"
                onClick={runAction(onOpenMembersModal)}
                icon={<Users size={18} />}
                iconBg="var(--c-paper, #F6F8F7)"
                iconColor="var(--c-ink, #17202A)"
                title="Manage Members"
                subtitle={`${trip?.members?.length || 0} members · roles & UPI`}
                trailing={
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--c-inkSoft, #6B7280)" }}>
                    {trip?.members?.length || 0}
                  </span>
                }
              />
            </div>
          </div>

          {/* SECTION 4: TOOLS & REPORTS */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={sectionLabelStyle}>Tools & Reports</span>
            <div style={sectionCardStyle}>
              <MenuActionRow
                id="btn-menu-open-share"
                onClick={runAction(onOpenShareModal)}
                icon={<Share2 size={18} />}
                iconBg="var(--c-tealSoft, #E6F7F2)"
                iconColor="var(--c-teal, #0F9F86)"
                title="Share & Export Balance Sheet"
                subtitle="PDF, Excel & WhatsApp summaries"
                showDivider
              />
              <MenuActionRow
                id="btn-menu-open-notifications"
                onClick={runAction(onOpenNotificationsModal)}
                icon={<Bell size={18} />}
                iconBg="var(--c-paper, #F6F8F7)"
                iconColor="var(--c-ink, #17202A)"
                title="Notifications"
                subtitle="Push, WhatsApp & in-app alerts"
                showDivider={Boolean(onNavigateToAnalytics || onNavigateToActivity || onOpenHealthModal)}
              />
              {onNavigateToAnalytics && (
                <MenuActionRow
                  id="btn-menu-open-analytics"
                  onClick={runAction(onNavigateToAnalytics)}
                  icon={<TrendingUp size={18} />}
                  iconBg="rgba(99, 102, 241, 0.12)"
                  iconColor="#6366F1"
                  title="Spending Analytics"
                  subtitle="Category breakdown & spending charts"
                  showDivider={Boolean(onNavigateToActivity || onOpenHealthModal)}
                />
              )}
              {onNavigateToActivity && (
                <MenuActionRow
                  id="btn-menu-open-activity"
                  onClick={runAction(onNavigateToActivity)}
                  icon={<Clock size={18} />}
                  iconBg="rgba(234, 179, 8, 0.12)"
                  iconColor="#EAB308"
                  title="Activity Audit Trail"
                  subtitle="Chronological record of edits and payments"
                  showDivider={Boolean(onOpenHealthModal)}
                />
              )}
              {onOpenHealthModal && (
                <MenuActionRow
                  id="btn-menu-open-system-health"
                  onClick={runAction(onOpenHealthModal)}
                  icon={<Activity size={18} />}
                  iconBg="rgba(45, 212, 191, 0.12)"
                  iconColor="#14B8A6"
                  title={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>System Health & DB</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 6,
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#10B981",
                          fontWeight: 700,
                          letterSpacing: "0.02em",
                        }}
                      >
                        2 AM Cron
                      </span>
                    </span>
                  }
                  subtitle="Automated checks, DB tables & live status"
                />
              )}
            </div>
          </div>

          {/* SECTION 5: APP SETTINGS */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={sectionLabelStyle}>App Settings</span>
            <div
              style={{
                background: "var(--c-card, #FFFFFF)",
                border: "1px solid var(--c-line, #E5E7EB)",
                borderRadius: 16,
                overflow: "visible",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--c-ink, #17202A)" }}>
                    App Theme
                  </div>
                  <div style={{ fontSize: 12, color: "var(--c-inkSoft, #6B7280)" }}>
                    Switch between light and dark
                  </div>
                </div>
                <ThemeToggle variant="segmented" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--c-line, #E5E7EB)",
            background: "var(--c-card, #FFFFFF)",
            textAlign: "center",
            fontSize: 12,
            color: "var(--c-inkSoft, #6B7280)",
            fontWeight: 500,
          }}
        >
          TravelSplit · Smart Travel Expense Splitter
        </div>
      </div>
    </div>
  );
}
