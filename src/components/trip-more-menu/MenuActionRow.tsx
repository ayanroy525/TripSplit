import React from "react";
import { ChevronRight } from "lucide-react";

interface MenuActionRowProps {
  id: string;
  onClick: () => void;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: React.ReactNode;
  subtitle: string;
  trailing?: React.ReactNode;
  showDivider?: boolean;
}

export function MenuActionRow({
  id,
  onClick,
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  trailing,
  showDivider = false,
}: MenuActionRowProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        background: "transparent",
        border: "none",
        borderBottom: showDivider ? "1px solid var(--c-line, #E5E7EB)" : "none",
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
            background: iconBg,
            color: iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--c-ink, #17202A)",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--c-inkSoft, #6B7280)",
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {trailing}
        <ChevronRight size={16} color="var(--c-inkSoft, #6B7280)" />
      </div>
    </button>
  );
}
