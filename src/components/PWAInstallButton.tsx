import React, { useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { PWAInstallModal } from "./PWAInstallModal";

interface PWAInstallButtonProps {
  className?: string;
  variant?: "pill" | "icon" | "menu-item";
  label?: string;
}

export function PWAInstallButton({
  className = "",
  variant = "pill",
  label = "Install App",
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If already running in standalone mode, hide install button
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setIsModalOpen(true);
      }
    } else {
      setIsModalOpen(true);
    }
  };

  if (variant === "icon") {
    return (
      <>
        <button
          id="btn-pwa-install-icon"
          type="button"
          onClick={handleClick}
          title="Install TripSplit App to home screen"
          aria-label="Install App"
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs hover:opacity-80 active:scale-95 ${className}`}
          style={{
            backgroundColor: "var(--c-card, #1E293B)",
            border: "1px solid var(--c-line, #334155)",
            color: "var(--c-ink, #F8FAFC)",
          }}
        >
          <Download size={16} className="text-teal-400" />
        </button>
        <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  if (variant === "menu-item") {
    return (
      <>
        <button
          id="btn-pwa-install-menu-item"
          type="button"
          onClick={handleClick}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer hover:opacity-90 ${className}`}
          style={{
            backgroundColor: "var(--c-paperDark, #1E293B)",
            color: "var(--c-ink, #F8FAFC)",
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.15))",
              color: "var(--c-teal, #2DD4BF)",
              borderColor: "var(--c-line, #334155)",
            }}
          >
            <Smartphone size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate">Install TripSplit App</div>
            <div className="text-[11px] truncate" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
              Add to Home Screen & offline sync
            </div>
          </div>
          <Download size={14} className="text-teal-400 shrink-0" />
        </button>
        <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        id="btn-pwa-install-pill"
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-xs hover:opacity-85 active:scale-95 ${className}`}
        style={{
          backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.15))",
          color: "var(--c-teal, #2DD4BF)",
          border: "1px solid var(--c-teal, #2DD4BF)",
        }}
        title="Install application for full offline access"
      >
        <Download size={12} />
        <span>{label}</span>
      </button>
      <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
