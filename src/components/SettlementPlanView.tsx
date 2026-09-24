import React, { useState } from "react";
import {
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Plus,
  Clock,
  Check,
  X,
  CreditCard,
  FileText,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { Trip, Member, SimplifiedDebt, Payment } from "../types";
import { money, formatDate } from "../utils/calculations";
import { Avatar } from "./Atoms";

interface SettlementPlanViewProps {
  trip: Trip;
  currentUser: Member;
  currentUserId: string;
  simplifiedDebts: SimplifiedDebt[];
  onOpenSettleModal: (debtorId?: string, creditorId?: string, amount?: number) => void;
  onConfirmPayment: (paymentId: string) => void;
  onRejectPayment: (paymentId: string) => void;
}

export function SettlementPlanView({
  trip,
  currentUser,
  currentUserId,
  simplifiedDebts,
  onOpenSettleModal,
  onConfirmPayment,
  onRejectPayment,
}: SettlementPlanViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<"plan" | "history">("plan");
  const members = trip.members || [];
  const payments = trip.payments || [];

  const getMember = (id: string): Member => {
    return (
      members.find((m) => m.id === id) || {
        id,
        name: "Unknown",
        avatarColor: "#6B7280",
        role: "member",
      }
    );
  };

  const totalPendingDebtAmount = simplifiedDebts.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. SECTION HEADER WITH TABS */}
      <div className="bg-[var(--c-card)] p-5 rounded-2xl border border-[var(--c-line)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] flex items-center justify-center font-bold text-sm">
              <Sparkles size={16} />
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[var(--c-ink)] tracking-tight">
              Optimal Settlement Plan
            </h2>
          </div>
          <p className="text-xs text-[var(--c-inkSoft)] mt-1">
            Greedy Min-Cash-Flow engine simplifies all debts into the fewest possible payments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Plan vs History Sub-tabs */}
          <div className="flex bg-[var(--c-lineSoft)] p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSubTab("plan")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === "plan"
                  ? "bg-[var(--c-card)] text-[var(--c-ink)] shadow-xs"
                  : "text-[var(--c-inkSoft)] hover:text-[var(--c-ink)]"
              }`}
            >
              Suggested Plan ({simplifiedDebts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === "history"
                  ? "bg-[var(--c-card)] text-[var(--c-ink)] shadow-xs"
                  : "text-[var(--c-inkSoft)] hover:text-[var(--c-ink)]"
              }`}
            >
              Settlement History ({payments.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenSettleModal()}
            className="px-3.5 py-1.5 bg-[var(--c-teal)] hover:bg-[var(--c-tealDark)] text-[var(--c-teal-contrast-text)] rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* 2. SUBTAB: OPTIMAL SETTLEMENT PLAN */}
      {activeSubTab === "plan" && (
        <div className="flex flex-col gap-4">
          {simplifiedDebts.length === 0 ? (
            <div className="bg-[var(--c-card)] rounded-2xl border border-[var(--c-line)] p-8 sm:p-12 text-center shadow-xs">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-base font-extrabold text-[var(--c-ink)]">All Group Debts Are Settled!</h3>
              <p className="text-xs text-[var(--c-inkSoft)] mt-1 max-w-sm mx-auto">
                No outstanding balances remain. Everyone in this trip is fully squared away.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {simplifiedDebts.map((debt, index) => {
                const debtor = getMember(debt.from);
                const creditor = getMember(debt.to);
                const involvesCurrentUser =
                  debt.from === currentUserId || debt.to === currentUserId;
                const isCurrentUserPaying = debt.from === currentUserId;

                return (
                  <div
                    key={debt.id || `debt_${index}`}
                    className={`bg-[var(--c-card)] rounded-2xl border p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4 transition-all ${
                      involvesCurrentUser
                        ? "border-teal-600/40 ring-2 ring-teal-600/10"
                        : "border-[var(--c-line)]"
                    }`}
                  >
                    {/* Top: Step Marker & Status */}
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md bg-[var(--c-lineSoft)] text-[var(--c-inkSoft)] text-[10px] font-bold">
                        Step {index + 1} of {simplifiedDebts.length}
                      </span>
                      {involvesCurrentUser && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isCurrentUserPaying
                              ? "bg-rose-100 text-[var(--c-rust)]"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {isCurrentUserPaying ? "You Need to Pay" : "You Receive Payment"}
                        </span>
                      )}
                    </div>

                    {/* Middle: Debtor -> Arrow -> Creditor */}
                    <div className="flex items-center justify-between gap-3 bg-[var(--c-paperDark)]/70 p-3.5 rounded-xl">
                      {/* Debtor */}
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar name={debtor.name} color={debtor.avatarColor} size={36} />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[var(--c-ink)] truncate">
                            {debtor.name}
                          </div>
                          <div className="text-[10px] text-[var(--c-inkSoft)]">Payer</div>
                        </div>
                      </div>

                      {/* Direction Arrow & Amount */}
                      <div className="flex flex-col items-center shrink-0 px-2">
                        <div className="text-xs sm:text-sm font-extrabold text-[var(--c-teal)]">
                          {money(debt.amount, trip.currency)}
                        </div>
                        <div className="flex items-center text-[var(--c-teal)] mt-0.5">
                          <ArrowRight size={16} />
                        </div>
                      </div>

                      {/* Creditor */}
                      <div className="flex items-center gap-2 min-w-0 justify-end">
                        <div className="min-w-0 text-right">
                          <div className="text-xs font-bold text-[var(--c-ink)] truncate">
                            {creditor.name}
                          </div>
                          <div className="text-[10px] text-[var(--c-inkSoft)]">Receiver</div>
                        </div>
                        <Avatar name={creditor.name} color={creditor.avatarColor} size={36} />
                      </div>
                    </div>

                    {/* Bottom: Action CTA */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="text-[11px] text-[var(--c-inkSoft)]">
                        {debtor.name} pays {creditor.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenSettleModal(debt.from, debt.to, debt.amount)}
                        className="px-3 py-1.5 bg-[var(--c-teal)] hover:bg-[var(--c-tealDark)] text-[var(--c-teal-contrast-text)] rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <CreditCard size={12} />
                        <span>Record Manual Payment</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. SUBTAB: SETTLEMENT HISTORY & PAYMENT AUDIT LOG */}
      {activeSubTab === "history" && (
        <div className="bg-[var(--c-card)] rounded-2xl border border-[var(--c-line)] p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[var(--c-ink)]">Recorded Payments & Settlement Audit</h3>
            <span className="text-xs text-[var(--c-inkSoft)]">{payments.length} payments recorded</span>
          </div>

          {payments.length === 0 ? (
            <div className="text-center py-10 text-[var(--c-inkSoft)] text-xs">
              <Clock size={28} className="mx-auto mb-2 opacity-40" />
              No settlement payments recorded yet.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-stone-100">
              {payments.map((p) => {
                const payer = getMember(p.from || p.fromUserId || "");
                const recipient = getMember(p.to || p.toUserId || "");
                const isConfirmed = p.status === "PAID" || p.status === "confirmed";
                const isPending = p.status === "pending_confirmation" || p.status === "PENDING";
                const isCancelled = p.status === "CANCELLED" || p.status === "cancelled";
                const isDisputed = p.status === "DISPUTED" || p.status === "disputed";

                const isCreditor = p.to === currentUserId || p.toUserId === currentUserId;
                const isDebtor = p.from === currentUserId || p.fromUserId === currentUserId;
                const isOwner = currentUser.role === "owner" || trip.ownerId === currentUserId;

                return (
                  <div key={p.id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <Avatar name={payer.name} color={payer.avatarColor} size={28} />
                        <Avatar name={recipient.name} color={recipient.avatarColor} size={28} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--c-ink)]">
                          <span className="text-[var(--c-ink)]">{payer.name}</span> paid{" "}
                          <span className="text-[var(--c-ink)]">{recipient.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--c-inkSoft)] mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            {formatDate(p.createdAt || p.ts || "")}
                          </span>
                          {p.method && (
                            <>
                              <span>•</span>
                              <span>Method: {p.method}</span>
                            </>
                          )}
                          {p.note && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[140px] italic">"{p.note}"</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs sm:text-sm font-extrabold text-[var(--c-ink)]">
                          {money(p.amount, trip.currency)}
                        </div>
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isConfirmed
                              ? "bg-emerald-100 text-emerald-800"
                              : isPending
                              ? "bg-amber-100 text-amber-800"
                              : isCancelled
                              ? "bg-rose-100 text-rose-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {isConfirmed
                            ? "Confirmed"
                            : isPending
                            ? "Pending Confirmation"
                            : isCancelled
                            ? "Cancelled"
                            : "Disputed"}
                        </span>
                      </div>

                      {/* Action buttons strictly authorized */}
                      {isPending && (
                        <div className="flex items-center gap-1.5">
                          {/* Only receiver or owner can confirm */}
                          {(isCreditor || isOwner) && (
                            <button
                              type="button"
                              onClick={() => onConfirmPayment(p.id)}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title="Confirm payment received"
                            >
                              <Check size={14} />
                              <span>Confirm</span>
                            </button>
                          )}

                          {/* Payer sees Waiting notice */}
                          {isDebtor && !isCreditor && !isOwner && (
                            <span className="text-[10px] text-amber-600 font-medium italic">
                              Waiting for receiver confirmation
                            </span>
                          )}

                          {/* Payer, receiver, or owner can cancel */}
                          {(isDebtor || isCreditor || isOwner) && (
                            <button
                              type="button"
                              onClick={() => onRejectPayment(p.id)}
                              className="p-1.5 bg-[var(--c-rustSoft)] hover:bg-rose-100 text-[var(--c-rust)] rounded-lg transition-colors cursor-pointer"
                              title="Cancel payment record"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
