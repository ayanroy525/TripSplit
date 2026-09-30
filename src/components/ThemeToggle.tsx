import React, { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor, ChevronDown } from "lucide-react";
import { useTheme, ThemeMode } from "../context/ThemeContext";
import { C } from "../utils/constants";

export interface ThemeToggleProps {
  variant?: "segmented" | "dropdown";
  compact?: boolean;
}

export function ThemeToggle({ variant = "segmented", compact = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options: Array<{ mode: ThemeMode; label: string; shortLabel: string; icon: typeof Sun }> = [
    { mode: "light", label: "Light", shortLabel: "Light", icon: Sun },
    { mode: "dark", label: "Dark", shortLabel: "Dark", icon: Moon },
    { mode: "system", label: "System", shortLabel: "Auto", icon: Monitor },
  ];

  if (variant === "segmented") {
    return (
      <div
        id="theme-segmented-group"
        role="radiogroup"
        aria-label="Select theme appearance"
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "var(--c-paper, #F3F4F6)",
          padding: 3,
          borderRadius: 12,
          border: `1px solid ${C.line}`,
          gap: 2,
        }}
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = theme === opt.mode;

          return (
            <button
              key={opt.mode}
              id={`btn-theme-${opt.mode}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(opt.mode)}
              title={`${opt.label} mode`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: compact ? "5px 8px" : "6px 11px",
                borderRadius: 9,
                border: isSelected ? `1px solid ${C.line}` : "1px solid transparent",
                background: isSelected ? C.card : "transparent",
                color: isSelected
                  ? resolvedTheme === "dark"
                    ? "var(--c-marigold, #F59E0B)"
                    : "var(--c-marigoldDark, #B45309)"
                  : "var(--c-inkSoft, #6B7280)",
                fontSize: 12,
                fontWeight: isSelected ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: isSelected ? "0 1px 3px rgba(0, 0, 0, 0.08)" : "none",
              }}
            >
              <Icon
                size={13}
                color={
                  isSelected
                    ? resolvedTheme === "dark"
                      ? "var(--c-marigold, #F59E0B)"
                      : "var(--c-marigoldDark, #B45309)"
                    : "currentColor"
                }
              />
              <span className="hidden sm:inline">{opt.label}</span>
              <span className="inline sm:hidden">{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const CurrentIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        id="btn-theme-toggle"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={`Current theme: ${theme} (${resolvedTheme}). Click to change.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 11px",
          borderRadius: 999,
          border: `1.5px solid ${C.line}`,
          background: C.card,
          color: C.ink,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          transition: "all 0.15s ease",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
        }}
        aria-label="Toggle dark and light theme"
        aria-expanded={isOpen}
      >
        <CurrentIcon
          size={14}
          color={resolvedTheme === "dark" ? "var(--c-marigold)" : "var(--c-marigoldDark)"}
          style={{ transition: "transform 0.2s ease" }}
        />
        <span style={{ textTransform: "capitalize" }}>{theme}</span>
        <ChevronDown size={11} color={C.inkSoft} />
      </button>

      {isOpen && (
        <div
          id="theme-dropdown-menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            background: C.card,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: 5,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.25)",
            zIndex: 1000,
            minWidth: 145,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            animation: "fadeIn 0.12s ease-out",
          }}
        >
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.mode;

            return (
              <button
                key={opt.mode}
                id={`btn-theme-${opt.mode}`}
                type="button"
                onClick={() => {
                  setTheme(opt.mode);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 9,
                  border: "none",
                  background: isSelected ? C.paperDark : "transparent",
                  color: isSelected ? (resolvedTheme === "dark" ? "var(--c-marigold)" : C.marigoldDark) : C.ink,
                  fontSize: 12.5,
                  fontWeight: isSelected ? 800 : 600,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s ease",
                }}
              >
                <Icon
                  size={14}
                  color={
                    isSelected
                      ? resolvedTheme === "dark"
                        ? "var(--c-marigold)"
                        : C.marigoldDark
                      : C.inkSoft
                  }
                />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
