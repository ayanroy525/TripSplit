import React from "react";
import { RotateCcw, AlertTriangle, Plus } from "lucide-react";
import { ModalShell } from "./Atoms";

interface ResetTripModalProps {
  onConfirmReset: (mode: "clean_scratch") => void;
  onClose: () => void;
}

export function ResetTripModal({ onConfirmReset, onClose }: ResetTripModalProps) {
  return (
    <ModalShell
      title="Reset & Start New Trip"
      subtitle="Clear current trip data and start fresh"
      onClose={onClose}
      width={480}
    >
      <div className="flex flex-col gap-4">
        {/* Warning Banner */}
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 text-xs">
          <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Reset Confirmation</div>
            <div className="text-amber-800 mt-0.5">
              Resetting will clear the currently loaded trip expenses and initialize a clean blank workspace.
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="p-3.5 rounded-xl border bg-teal-50/50 border-teal-800 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] flex items-center justify-center shrink-0">
            <Plus size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-[var(--c-ink)]">Start Fresh Trip (Blank Slate)</div>
            <div className="text-[11px] text-[var(--c-inkSoft)] mt-0.5">
              Creates a new empty trip with zero expenses so you can start logging from scratch.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--c-lineSoft)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[var(--c-inkSoft)] hover:bg-[var(--c-lineSoft)] rounded-xl border border-[var(--c-line)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmReset("clean_scratch");
              onClose();
            }}
            className="px-4 py-2 text-xs font-bold text-[var(--c-teal-contrast-text)] bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Confirm & Reset</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
