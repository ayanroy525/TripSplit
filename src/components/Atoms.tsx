import React from "react";
import { Crown, Eye, UserCircle2, X } from "lucide-react";
import { Member, Role } from "../types";
import { C, CATEGORY_META, getCategoryMeta } from "../utils/constants";

export function Avatar({
  member,
  name,
  color,
  avatarColor,
  size = 36,
  showName = false,
  className = "",
}: {
  member?: Member;
  name?: string;
  color?: string;
  avatarColor?: string;
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const finalName = member?.name || name || "?";
  const finalColor = member?.avatarColor || color || avatarColor || C.teal;
  const initial = finalName ? finalName.charAt(0).toUpperCase() : "?";

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div
        title={finalName}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: finalColor,
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: Math.max(10, Math.round(size * 0.42)),
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {initial}
      </div>
      {showName && (
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
          {finalName}
        </span>
      )}
    </div>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const map = {
    owner: { icon: Crown, label: "Owner", bg: C.marigoldDark },
    member: { icon: UserCircle2, label: "Member", bg: C.teal },
    viewer: { icon: Eye, label: "Viewer", bg: C.inkSoft },
  };
  const cfg = map[role] || map.member;
  const Icon = cfg.icon;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        color: "#ffffff",
        background: cfg.bg,
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      <Icon size={11} strokeWidth={2.5} /> {cfg.label}
    </span>
  );
}

export function CategoryBadge({
  category,
  title,
  size = "md",
}: {
  category: string;
  title?: string;
  size?: "sm" | "md";
}) {
  const meta = getCategoryMeta(category, title);
  const Icon = meta.icon;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size === "sm" ? 4 : 6,
        fontSize: size === "sm" ? 11.5 : 12.5,
        fontWeight: 700,
        color: meta.text || meta.color,
        background: meta.bg || `${meta.color}15`,
        border: `1px solid ${meta.color}35`,
        borderRadius: 999,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={size === "sm" ? 12 : 14} />
      {meta.resolvedCategory}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: "none",
        flexShrink: 0,
        background: checked ? C.teal : C.line,
        position: "relative",
        cursor: "pointer",
        transition: "background .18s ease",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#ffffff",
          transition: "left .18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export interface PillProps {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone?: string;
  id?: string;
  key?: React.Key;
}

export function Pill({
  children,
  active,
  onClick,
  tone,
  id,
}: PillProps) {
  const activeBg = tone || C.teal;
  const isInk = tone === C.ink || (typeof tone === "string" && tone.includes("--c-ink"));

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      style={{
        fontWeight: 700,
        fontSize: 13,
        padding: "8px 16px",
        minHeight: 40,
        borderRadius: 999,
        border: `1.5px solid ${active ? activeBg : C.line}`,
        background: active ? activeBg : "var(--c-card, #FFFFFF)",
        color: active
          ? isInk
            ? "var(--c-paper, #F8F9FA)"
            : "#ffffff"
          : C.ink,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all .15s ease",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        boxShadow: active ? "0 2px 8px rgba(15, 107, 101, 0.2)" : "none",
      }}
    >
      {children}
    </button>
  );
}

export interface TicketCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  highlight?: boolean;
  key?: React.Key;
}

export function TicketCard({
  children,
  style,
  className = "",
  highlight = false,
}: TicketCardProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        background: C.card,
        border: `1px solid ${highlight ? C.teal : C.line}`,
        borderRadius: 16,
        boxShadow: highlight
          ? "0 4px 16px rgba(15, 107, 101, 0.12)"
          : "0 2px 8px rgba(0, 0, 0, 0.04)",
        overflow: "hidden",
        transition: "border-color .15s, box-shadow .15s",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  width = 540,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.modalOverlay,
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.paper,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 20,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)",
          border: `1px solid ${C.line}`,
          overflow: "hidden",
          animation: "modalSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${C.line}`,
            background: C.paperDark,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 18,
                color: C.ink,
                margin: 0,
                fontWeight: 800,
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  color: C.inkSoft,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            id="btn-close-modal"
            onClick={onClose}
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: C.ink,
              transition: "background .15s",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "18px 20px 24px", overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.modalOverlay,
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.paper,
          width: "100%",
          maxWidth: 580,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.2)",
          border: `1px solid ${C.line}`,
          borderBottom: "none",
          overflow: "hidden",
          animation: "bottomSheetSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Grab Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: C.line }} />
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 20px 14px",
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <div>
            <h3 style={{ fontSize: 18, color: C.ink, margin: 0, fontWeight: 800 }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ margin: "2px 0 0", fontSize: 12, color: C.inkSoft }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: C.paperDark,
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: C.ink,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: "18px 20px 28px", overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
