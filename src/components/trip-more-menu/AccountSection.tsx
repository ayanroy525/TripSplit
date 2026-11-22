import React from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { Trip, Member, UserAccount } from "../../types";
import { Avatar } from "../Atoms";
import { getRoleDisplayName } from "../../utils/permissions";

interface AccountSectionProps {
  trip?: Trip | null;
  currentUser: Member | undefined;
  currentUserId: string;
  onSelectUserId: (id: string) => void;
  authUser: UserAccount | null;
  onOpenProfile: () => void;
  onLogout: () => void;
  onClose: () => void;
}

export function AccountSection({
  trip,
  currentUser,
  currentUserId,
  onSelectUserId,
  authUser,
  onOpenProfile,
  onLogout,
  onClose,
}: AccountSectionProps) {
  return (
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
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--c-ink, #17202A)" }}>
                {authUser?.name || "Logged In User"}
              </div>
              <div style={{ fontSize: 12, color: "var(--c-inkSoft, #6B7280)", marginTop: 1 }}>
                {authUser?.email || "Manage profile & settings"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-teal, #0F9F86)" }}>
              Edit
            </span>
            <ChevronRight size={16} color="var(--c-inkSoft, #6B7280)" />
          </div>
        </button>

        <button
          id="btn-menu-account-logout"
          type="button"
          onClick={onLogout}
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
                {currentUser?.name} ({getRoleDisplayName(currentUser?.role)})
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
  );
}
