import React from "react";
import {
  X,
  MessageCircle,
  UserPlus,
  Users,
  Share2,
  Bell,
  Compass,
  ChevronRight,
  Plus,
  LogOut,
} from "lucide-react";
import { Trip, Member, UserAccount } from "../types";
import { Avatar } from "./Atoms";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";

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
}

export function TripMoreMenuModal({
  isOpen,
  onClose,
  trip,
  currentUser,
  currentUserId,
  onSelectUserId,
  authUser,
  isViewer = false,
  onOpenAddExpense,
  onOpenProfile,
  onOpenAuthPage,
  onOpenWhatsAppAlerts,
  onOpenInviteModal,
  onOpenMembersModal,
  onOpenShareModal,
  onOpenNotificationsModal,
  onOpenTripsHub,
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
          {/* SECTION 1: YOUR ACCOUNT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--c-inkSoft, #6B7280)",
                paddingLeft: 4,
              }}
            >
              Your Account
            </span>

            <div
              style={{
                background: "var(--c-card, #FFFFFF)",
                border: "1px solid var(--c-line, #E5E7EB)",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              {/* Account profile row */}
              <button
                id="btn-menu-open-profile"
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: authUser?.avatarColor || "var(--c-teal, #0F9F86)",
                      color: "#ffffff",
                      fontSize: 16,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {authUser?.name ? authUser.name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: 700,
                        color: "var(--c-ink, #17202A)",
                      }}
                    >
                      {authUser?.name || "Logged In User"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--c-inkSoft, #6B7280)",
                        marginTop: 1,
                      }}
                    >
                      {authUser?.email || "Manage profile & settings"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--c-teal, #0F9F86)",
                    }}
                  >
                    Edit
                  </span>
                  <ChevronRight size={16} color="var(--c-inkSoft, #6B7280)" />
                </div>
              </button>

              {/* Log Out Button directly in Account card */}
              <button
                id="btn-menu-account-logout"
                type="button"
                onClick={handleLogout}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 16px",
                  background: "rgba(220, 38, 38, 0.05)",
                  border: "none",
                  borderTop: "1px solid var(--c-line, #E5E7EB)",
                  cursor: "pointer",
                  color: "var(--c-rust, #DC2626)",
                  fontSize: 13,
                  fontWeight: 700,
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <LogOut size={15} />
                  <span>Log Out ({authUser?.name || "User"})</span>
                </div>
                <ChevronRight size={15} color="var(--c-rust, #DC2626)" />
              </button>

              {/* Active Traveler Context Switcher */}
              <div
                style={{
                  borderTop: "1px solid var(--c-line, #E5E7EB)",
                  padding: "12px 16px",
                  background: "var(--c-paper, #F6F8F7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Avatar member={currentUser} size={28} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: "var(--c-inkSoft, #6B7280)",
                        letterSpacing: "0.03em",
                      }}
                    >
                      Acting As Traveler
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--c-ink, #17202A)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {currentUser?.name} ({currentUser?.role || "member"})
                    </div>
                  </div>
                </div>

                <select
                  id="select-menu-active-user"
                  value={currentUserId}
                  onChange={(e) => onSelectUserId(e.target.value)}
                  style={{
                    background: "var(--c-card, #FFFFFF)",
                    border: "1px solid var(--c-line, #E5E7EB)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--c-ink, #17202A)",
                    cursor: "pointer",
                    outline: "none",
                    maxWidth: 130,
                  }}
                  title="Switch acting traveler"
                >
                  {(trip?.members || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 2: ACTIVE TRIP */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--c-inkSoft, #6B7280)",
                paddingLeft: 4,
              }}
            >
              Active Trip
            </span>

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
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--c-inkSoft, #6B7280)",
                    marginTop: 2,
                  }}
                >
                  {trip ? `${trip.location} · ${trip.members.length} members` : "No trip selected"}
                </div>
              </div>

              <button
                id="btn-menu-open-trips-hub"
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTripsHub();
                }}
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
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--c-inkSoft, #6B7280)",
                paddingLeft: 4,
              }}
            >
              Group & Communication
            </span>

            <div
              style={{
                background: "var(--c-card, #FFFFFF)",
                border: "1px solid var(--c-line, #E5E7EB)",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              {/* Row 1: WhatsApp Group Alerts */}
              <button
                id="btn-menu-open-whatsapp"
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWhatsAppAlerts();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--c-line, #E5E7EB)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "#E7F8EE",
                      color: "#25D366",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <MessageCircle size={18} color="#25D366" />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--c-ink, #17202A)",
                      }}
                    >
                      WhatsApp Group Alerts
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--c-inkSoft, #6B7280)",
                      }}
                    >
                      One-click expense & payment updates
                    </div>
                  </div>
                </div>

                <ChevronRight size={16} color="var(--c-inkSoft, #6B7280)" />
              </button>

              {/* Row 2: Invite Friends */}
              <button
                id="btn-menu-open-invite"
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInviteModal();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--c-line, #E5E7EB)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "var(--c-tealSoft, #E6F7F2)",
                      color: "var(--c-teal, #0F9F86)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <UserPlus size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--c-ink, #17202A)",
                      }}
                    >
                      Invite Friends
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--c-inkSoft, #6B7280)",
                      }}
                    >
                      Share trip link or QR code
                    </div>
                  </div>
                </div>

                <ChevronRight size={16} color="var(--c-inkSoft, #6B7280)" />
              </button>

              {/* Row 3: Manage Members */}
              <button
                id="btn-menu-open-members"
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMembersModal();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "var(--c-paper, #F6F8F7)",
                      color: "var(--c-ink, #17202A)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Users size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--c-ink, #17202A)",
                      }}
                    >
                      Manage Members
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--c-inkSoft, #6B7280)",
                      }}
                    >
                      {trip?.members?.length || 0} members · roles & UPI
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--c-inkSoft, #6B7280)",
                    }}
                  >
                    {trip?.members?.length || 0}
                  </span>
                  <ChevronRight size={16} color="var(--c-inkSoft, #6B7280)" />
                </div>
              </button>
            </div>
          </div>

          {/* SECTION 4: TOOLS & REPORTS */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--c-inkSoft, #6B7280)",
                paddingLeft: 4,
              }}
            >
              Tools & Reports
            </span>

            <div
              style={{
                background: "var(--c-card, #FFFFFF)",
                border: "1px solid var(--c-line, #E5E7EB)",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              {/* Row 1: Share & Export Balance Sheet */}
              <button
                id="btn-menu-open-share"
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShareModal();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--c-line, #E5E7EB)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "var(--c-tealSoft, #E6F7F2)",
                      color: "var(--c-teal, #0F9F86)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Share2 size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--c-ink, #17202A)",
                      }}
                    >
                      Share & Export Balance Sheet
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--c-inkSoft, #6B7280)",
                      }}
                    >
                      PDF, Excel & WhatsApp summaries
                    </div>
                  </div>
                </div>

                <ChevronRight size={16} color="var(--c-inkSoft, #6B7280)" />
              </button>

              {/* Row 2: Notifications Center */}
              <button
                id="btn-menu-open-notifications"
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNotificationsModal();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "var(--c-paper, #F6F8F7)",
                      color: "var(--c-ink, #17202A)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Bell size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--c-ink, #17202A)",
                      }}
                    >
                      Notifications
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--c-inkSoft, #6B7280)",
                      }}
                    >
                      Push, WhatsApp & in-app alerts
                    </div>
                  </div>
                </div>

                <ChevronRight size={16} color="var(--c-inkSoft, #6B7280)" />
              </button>
            </div>
          </div>

          {/* SECTION 5: APP SETTINGS */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--c-inkSoft, #6B7280)",
                paddingLeft: 4,
              }}
            >
              App Settings
            </span>

            <div
              style={{
                background: "var(--c-card, #FFFFFF)",
                border: "1px solid var(--c-line, #E5E7EB)",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              {/* Row 1: App Theme */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--c-line, #E5E7EB)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--c-ink, #17202A)",
                    }}
                  >
                    App Theme
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--c-inkSoft, #6B7280)",
                    }}
                  >
                    Switch between light and dark
                  </div>
                </div>

                <ThemeToggle />
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
