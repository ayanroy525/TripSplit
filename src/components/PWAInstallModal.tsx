import React from "react";
import { X, Smartphone, Download, Share2, PlusSquare, Sparkles, WifiOff, Zap } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PWAInstallModal({ isOpen, onClose }: PWAInstallModalProps) {
  const { isInstallable, isIOS, install } = usePWAInstall();

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  return (
    <div
      id="modal-pwa-install"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-2xl w-full max-w-sm flex flex-col overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: "var(--c-paper, #0F172A)",
          borderColor: "var(--c-line, #334155)",
          color: "var(--c-ink, #F8FAFC)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-5 text-center relative border-b"
          style={{
            backgroundColor: "var(--c-paperDark, #1E293B)",
            borderColor: "var(--c-line, #334155)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-slate-400 hover:text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>

          <div
            className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center border shadow-lg mb-3"
            style={{
              backgroundColor: "var(--c-tealDark, #0F6B65)",
              borderColor: "var(--c-teal, #2DD4BF)",
            }}
          >
            <img src="/icon.svg" alt="TripSplit Icon" className="w-12 h-12" />
          </div>

          <h3 className="text-base font-bold tracking-tight" style={{ color: "var(--c-ink, #F8FAFC)" }}>
            Install TripSplit App
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
            Instant group travel expense splitting
          </p>
        </div>

        {/* Benefits List */}
        <div className="p-5 space-y-3.5 text-xs">
          <div className="flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.15))",
                color: "var(--c-teal, #2DD4BF)",
                borderColor: "var(--c-line, #334155)",
              }}
            >
              <WifiOff size={14} />
            </div>
            <div>
              <div className="font-bold" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                Works 100% Offline
              </div>
              <div style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                Log spending on flights, trains, and remote mountain trails.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.15))",
                color: "var(--c-teal, #2DD4BF)",
                borderColor: "var(--c-line, #334155)",
              }}
            >
              <Zap size={14} />
            </div>
            <div>
              <div className="font-bold" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                Instant Home Screen Access
              </div>
              <div style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                Launches in full-screen native mode without browser URL bars.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: "var(--c-tealSoft, rgba(15, 107, 101, 0.15))",
                color: "var(--c-teal, #2DD4BF)",
                borderColor: "var(--c-line, #334155)",
              }}
            >
              <Sparkles size={14} />
            </div>
            <div>
              <div className="font-bold" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                Zero App Store Storage
              </div>
              <div style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                No large multi-hundred megabyte downloads or app updates required.
              </div>
            </div>
          </div>

          {/* iOS Specific instructions */}
          {isIOS && (
            <div
              className="p-3 rounded-xl border mt-2 space-y-2"
              style={{
                backgroundColor: "var(--c-paperDark, #1E293B)",
                borderColor: "var(--c-line, #334155)",
              }}
            >
              <div className="font-bold flex items-center gap-1.5 text-amber-400">
                <Share2 size={13} />
                <span>How to Install on iPhone / iPad:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11.5px] leading-relaxed text-slate-300">
                <li>
                  Tap the Safari <strong>Share</strong> button at bottom of screen.
                </li>
                <li>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>{" "}
                  <PlusSquare size={12} className="inline ml-0.5 align-middle" />.
                </li>
                <li>
                  Tap <strong>Add</strong> in the top-right corner.
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div
          className="p-4 border-t flex items-center gap-2"
          style={{
            backgroundColor: "var(--c-paperDark, #1E293B)",
            borderColor: "var(--c-line, #334155)",
          }}
        >
          {isInstallable ? (
            <button
              type="button"
              onClick={handleNativeInstall}
              className="flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer hover:opacity-90"
              style={{
                backgroundColor: "var(--c-teal, #0F6B65)",
                color: "var(--c-teal-contrast-text, #FFFFFF)",
              }}
            >
              <Download size={15} />
              <span>Install to Home Screen</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl font-semibold text-xs border transition cursor-pointer hover:opacity-80"
              style={{
                backgroundColor: "var(--c-card, #1E293B)",
                borderColor: "var(--c-line, #334155)",
                color: "var(--c-ink, #F8FAFC)",
              }}
            >
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
