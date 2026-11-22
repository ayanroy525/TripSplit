import React, { useEffect, useId, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title = "Confirm Action",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm rounded-2xl border border-[var(--c-line)] bg-[var(--c-card)] p-5 shadow-2xl text-[var(--c-ink)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                destructive
                  ? "bg-rose-500/15 text-rose-500"
                  : "bg-teal-500/15 text-teal-500"
              }`}
            >
              <AlertTriangle size={18} />
            </span>
            <h2 id={titleId} className="text-base font-bold leading-snug">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="rounded-lg p-1 text-[var(--c-inkSoft)] hover:bg-[var(--c-lineSoft)] hover:text-[var(--c-ink)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <p
          id={descriptionId}
          className="mt-3 text-sm leading-relaxed text-[var(--c-inkSoft)]"
        >
          {message}
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--c-line)] bg-transparent px-3.5 py-2 text-xs font-semibold text-[var(--c-ink)] hover:bg-[var(--c-lineSoft)] cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold text-white cursor-pointer ${
              destructive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-teal-600 hover:bg-teal-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
