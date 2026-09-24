import React, { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Send,
  Trash2,
  Sparkles,
  Check,
  CreditCard,
  Calendar,
  FileText,
  Clock,
  UserCheck,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Member, Payment, SimplifiedDebt } from "../types";
import { C } from "../utils/constants";
import { money, nowStr, uid } from "../utils/calculations";
import { Avatar, ModalShell, Pill } from "./Atoms";

interface SettleUpModalProps {
  tripId?: string;
  members: Member[];
  simplifiedDebts: SimplifiedDebt[];
  payments: Payment[];
  tripTitle: string;
  currentUserId: string;
  onRecordPayment: (payment: Payment) => void;
  onUpdatePaymentStatus: (paymentId: string, status: Payment["status"]) => void;
  onDeletePayment: (paymentId: string) => void;
  onClose: () => void;
}

export function SettleUpModal({
  tripId,
  members,
  simplifiedDebts,
  payments,
  tripTitle,
  currentUserId,
  onRecordPayment,
  onUpdatePaymentStatus,
  onDeletePayment,
  onClose,
}: SettleUpModalProps) {
  const [activeTab, setActiveTab] = useState<"suggested" | "custom" | "history">("suggested");

  // Custom settlement form state
  const [fromId, setFromId] = useState(members[0]?.id || "");
  const [toId, setToId] = useState(members[1]?.id || "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("Cash");
  const [note, setNote] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  const memberMap = new Map(members.map((m) => [m.id, m]));

  const triggerConfetti = () => {
    confetti({
      particleCount: 60,
      spread: 60,
      origin: { y: 0.6 },
      colors: ["#E39A2D", "#0F6B65", "#C2543A", "#7B5EA7"],
    });
  };

  const handleQuickSettle = (debt: SimplifiedDebt) => {
    const fromMember = memberMap.get(debt.from);
    const toMember = memberMap.get(debt.to);
    const now = new Date().toISOString();
    const isReceiver = debt.to === currentUserId;
    const initialStatus = isReceiver ? "confirmed" : "pending_confirmation";

    const newPayment: Payment = {
      id: uid("pay"),
      settlementId: uid("pay"),
      tripId: tripId || "active_trip",
      from: debt.from,
      to: debt.to,
      fromUserId: debt.from,
      toUserId: debt.to,
      amount: debt.amount,
      status: initialStatus,
      method: "Cash",
      markedPaidBy: currentUserId,
      confirmedBy: isReceiver ? currentUserId : undefined,
      paidAt: isReceiver ? now : undefined,
      ts: nowStr(),
      note: `Settlement: ${fromMember?.name} → ${toMember?.name}`,
      createdAt: now,
      updatedAt: now,
    };

    onRecordPayment(newPayment);
    triggerConfetti();
  };

  const handleCustomSettle = () => {
    const numAmt = parseFloat(amount);
    if (!numAmt || numAmt <= 0 || fromId === toId) return;

    const fromMember = memberMap.get(fromId);
    const toMember = memberMap.get(toId);
    const now = new Date().toISOString();
    const isReceiver = toId === currentUserId;
    const initialStatus = isReceiver ? "confirmed" : "pending_confirmation";

    const newPayment: Payment = {
      id: uid("pay"),
      settlementId: uid("pay"),
      tripId: tripId || "active_trip",
      from: fromId,
      to: toId,
      fromUserId: fromId,
      toUserId: toId,
      amount: numAmt,
      status: initialStatus,
      method: method || "Cash",
      markedPaidBy: currentUserId,
      confirmedBy: isReceiver ? currentUserId : undefined,
      paidAt: isReceiver ? now : undefined,
      ts: nowStr(),
      note: note.trim() || `Manual settlement: ${fromMember?.name} → ${toMember?.name}`,
      createdAt: now,
      updatedAt: now,
    };

    onRecordPayment(newPayment);
    setAmount("");
    setNote("");
    setActiveTab("history");
    triggerConfetti();
  };

  return (
    <ModalShell
      title="Settlement Tracking"
      subtitle="Record offline payments & track group settlement status"
      onClose={onClose}
      width={600}
    >
      <div className="flex flex-col gap-4">
        {/* Tab switcher */}
        <div className="flex gap-2 pb-3 border-b" style={{ borderColor: "var(--c-line, #334155)", overflowX: "auto" }}>
          <Pill
            id="tab-suggested-debts"
            active={activeTab === "suggested"}
            onClick={() => setActiveTab("suggested")}
            tone={C.teal}
          >
            Suggested Settlements ({simplifiedDebts.length})
          </Pill>
          <Pill
            id="tab-record-custom"
            active={activeTab === "custom"}
            onClick={() => setActiveTab("custom")}
            tone={C.saffron}
          >
            Record Manual Payment
          </Pill>
          <Pill
            id="tab-payment-history"
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            tone={C.purple}
          >
            Settlement History ({payments.length})
          </Pill>
        </div>

        {/* Tab 1: Suggested Settlements */}
        {activeTab === "suggested" && (
          <div className="flex flex-col gap-3">
            {simplifiedDebts.length === 0 ? (
              <div className="p-8 text-center rounded-xl border" style={{ backgroundColor: "var(--c-tealSoft, rgba(45, 212, 191, 0.1))", borderColor: "var(--c-teal, #2DD4BF)" }}>
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--c-teal, #2DD4BF)" }} />
                <div className="text-base font-semibold" style={{ color: "var(--c-teal, #2DD4BF)" }}>All Balances Settled!</div>
                <div className="text-sm mt-1" style={{ color: "var(--c-ink, #F8FAFC)", opacity: 0.8 }}>
                  Everyone in this trip is squared away. No outstanding debts remaining.
                </div>
              </div>
            ) : (
              <>
                <div className="text-xs flex items-center gap-1.5 px-1 font-medium" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                  <Sparkles className="w-4 h-4" style={{ color: "var(--c-marigoldDark, #B45309)" }} />
                  Optimized with minimum required cash/bank transactions:
                </div>

                <div className="flex flex-col gap-2.5">
                  {simplifiedDebts.map((debt, i) => {
                    const fromMember = memberMap.get(debt.from);
                    const toMember = memberMap.get(debt.to);
                    const isMyDebt = debt.from === currentUserId;
                    const isOwedToMe = debt.to === currentUserId;

                    return (
                      <div
                        key={i}
                        className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all shadow-sm"
                        style={{
                          backgroundColor: isMyDebt
                            ? "var(--c-amberSoft, rgba(217, 119, 6, 0.1))"
                            : isOwedToMe
                            ? "var(--c-tealSoft, rgba(45, 212, 191, 0.1))"
                            : "var(--c-card, #1E293B)",
                          borderColor: isMyDebt
                            ? "var(--c-marigoldDark, #B45309)"
                            : isOwedToMe
                            ? "var(--c-teal, #2DD4BF)"
                            : "var(--c-line, #334155)",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar member={fromMember} size={38} />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                              <span>{fromMember?.name || "Unknown"}</span>
                              <ArrowRight className="w-3.5 h-3.5" style={{ color: "var(--c-inkSoft, #94A3B8)" }} />
                              <span>{toMember?.name || "Unknown"}</span>
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                              {isMyDebt ? "You owe this amount" : isOwedToMe ? "You are owed this amount" : "Direct member settlement"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0" style={{ borderColor: "var(--c-line, #334155)" }}>
                          <div className="text-base font-bold" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                            {money(debt.amount)}
                          </div>
                          <button
                            id={`btn-record-settlement-${i}`}
                            onClick={() => handleQuickSettle(debt)}
                            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer hover:opacity-80"
                            style={{ backgroundColor: "var(--c-teal, #2DD4BF)", color: "var(--c-teal-contrast-text, #0F172A)" }}
                          >
                            <Check className="w-3.5 h-3.5" />
                            Record as Paid
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Record Manual Payment */}
        {activeTab === "custom" && (
          <div
            className="flex flex-col gap-4 p-4 rounded-xl border"
            style={{
              backgroundColor: "var(--c-card, #1E293B)",
              borderColor: "var(--c-line, #334155)",
            }}
          >
            <div className="text-xs font-medium" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
              Log an offline payment made between group members (e.g. cash handoff, bank transfer):
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                  Paid By (Sender)
                </label>
                <select
                  id="select-settlement-from"
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: "var(--c-paperDark, #0F172A)",
                    borderColor: "var(--c-line, #334155)",
                    color: "var(--c-ink, #F8FAFC)",
                    border: "1px solid var(--c-line, #334155)",
                  }}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.id === currentUserId ? "(You)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                  Paid To (Receiver)
                </label>
                <select
                  id="select-settlement-to"
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: "var(--c-paperDark, #0F172A)",
                    borderColor: "var(--c-line, #334155)",
                    color: "var(--c-ink, #F8FAFC)",
                    border: "1px solid var(--c-line, #334155)",
                  }}
                >
                  {members
                    .filter((m) => m.id !== fromId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.id === currentUserId ? "(You)" : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                  Amount (₹)
                </label>
                <input
                  id="input-settlement-amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none font-medium transition-colors"
                  style={{
                    backgroundColor: "var(--c-paperDark, #0F172A)",
                    borderColor: "var(--c-line, #334155)",
                    color: "var(--c-ink, #F8FAFC)",
                    border: "1px solid var(--c-line, #334155)",
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                  Payment Method
                </label>
                <select
                  id="select-settlement-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: "var(--c-paperDark, #0F172A)",
                    borderColor: "var(--c-line, #334155)",
                    color: "var(--c-ink, #F8FAFC)",
                    border: "1px solid var(--c-line, #334155)",
                  }}
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                  <option value="UPI">Manual UPI Handoff</option>
                  <option value="Other">Other Offline Method</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                  Date
                </label>
                <input
                  id="input-settlement-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: "var(--c-paperDark, #0F172A)",
                    borderColor: "var(--c-line, #334155)",
                    color: "var(--c-ink, #F8FAFC)",
                    border: "1px solid var(--c-line, #334155)",
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                Optional Note / Reference
              </label>
              <input
                id="input-settlement-note"
                type="text"
                placeholder="e.g. Cash handed at hotel lobby, Bank transfer ref #48291"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={{
                  backgroundColor: "var(--c-paperDark, #0F172A)",
                  borderColor: "var(--c-line, #334155)",
                  color: "var(--c-ink, #F8FAFC)",
                  border: "1px solid var(--c-line, #334155)",
                }}
              />
            </div>

            <button
              id="btn-confirm-record-payment"
              onClick={handleCustomSettle}
              disabled={!amount || parseFloat(amount) <= 0 || fromId === toId}
              className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer mt-1 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "var(--c-teal, #2DD4BF)",
                color: "var(--c-teal-contrast-text, #0F172A)",
              }}
            >
              <Check className="w-4 h-4" />
              Record Manual Payment
            </button>
          </div>
        )}

        {/* Tab 3: Settlement History */}
        {activeTab === "history" && (
          <div className="flex flex-col gap-3">
            {payments.length === 0 ? (
              <div className="p-8 text-center rounded-xl border" style={{ backgroundColor: "var(--c-card, #1E293B)", borderColor: "var(--c-line, #334155)" }}>
                <Clock className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--c-inkSoft, #94A3B8)" }} />
                <div className="text-sm font-medium" style={{ color: "var(--c-ink, #F8FAFC)" }}>No settlements recorded yet.</div>
                <div className="text-xs mt-1" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                  Recorded payments between members will appear here.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                {payments.map((p) => {
                  const fromMember = memberMap.get(p.fromUserId || p.from);
                  const toMember = memberMap.get(p.toUserId || p.to);
                  const isConfirmed = p.status === "PAID" || p.status === "confirmed";
                  const isPending = p.status === "pending_confirmation" || p.status === "PENDING";
                  const isCancelled = p.status === "CANCELLED" || p.status === "cancelled";
                  const isDisputed = p.status === "DISPUTED" || p.status === "disputed";

                  const isCreditor = p.to === currentUserId || p.toUserId === currentUserId;
                  const isDebtor = p.from === currentUserId || p.fromUserId === currentUserId;

                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{ backgroundColor: "var(--c-card, #1E293B)", borderColor: "var(--c-line, #334155)" }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                          <Avatar member={fromMember} size={32} />
                          <Avatar member={toMember} size={32} />
                        </div>
                        <div className="flex flex-col">
                          <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                            <span>{fromMember?.name || "Sender"}</span>
                            <ArrowRight className="w-3 h-3" style={{ color: "var(--c-inkSoft, #94A3B8)" }} />
                            <span>{toMember?.name || "Recipient"}</span>
                          </div>
                          <div className="text-xs flex items-center gap-2 mt-0.5" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                            <span>{p.ts || p.createdAt?.split("T")[0] || "Recorded"}</span>
                            {p.method && <span>• {p.method}</span>}
                            {p.note && <span>• {p.note}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0" style={{ borderColor: "var(--c-line, #334155)" }}>
                        <div className="text-right">
                          <div className="text-sm font-bold" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                            {money(p.amount)}
                          </div>
                          <div
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border mt-0.5 ${
                              isConfirmed
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : isPending
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : isCancelled
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            }`}
                          >
                            {isConfirmed && <CheckCircle2 className="w-3 h-3" />}
                            {isPending && <Clock className="w-3 h-3" />}
                            {isConfirmed ? "Confirmed" : isPending ? "Pending Confirmation" : isCancelled ? "Cancelled" : "Disputed"}
                          </div>
                        </div>

                        {/* Confirmation & cancellation controls */}
                        {isPending && isCreditor && (
                          <button
                            id={`btn-confirm-payment-${p.id}`}
                            onClick={() => onUpdatePaymentStatus(p.id, "confirmed")}
                            title="Confirm payment received"
                            className="p-1.5 rounded-lg transition-colors cursor-pointer bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}

                        {isPending && isDebtor && !isCreditor && (
                          <span className="text-[10px] text-amber-400 italic">
                            Waiting for receiver
                          </span>
                        )}

                        {(isDebtor || isCreditor) && (
                          <button
                            id={`btn-delete-settlement-${p.id}`}
                            onClick={() => onDeletePayment(p.id)}
                            title="Cancel settlement record"
                            className="p-1.5 rounded-lg transition-colors cursor-pointer hover:opacity-80"
                            style={{ color: "var(--c-rust, #E11D48)" }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
    </ModalShell>
  );
}
