import React, { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor, ChevronDown } from "lucide-react";
import { useTheme, ThemeMode } from "../context/ThemeContext";
import { C } from "../utils/constants";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
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

  const options: Array<{ mode: ThemeMode; label: string; icon: typeof Sun }> = [
    { mode: "light", label: "Light Mode", icon: Sun },
    { mode: "dark", label: "Dark Mode", icon: Moon },
    { mode: "system", label: "System Theme", icon: Monitor },
  ];

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
            top: "calc(100% + 6px)",
            right: 0,
            background: C.card,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: 5,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.25)",
            zIndex: 100,
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
