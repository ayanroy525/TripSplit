import React, { useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  CreditCard,
  UserCheck,
} from "lucide-react";
import { Trip, Member, Debt, Payment } from "../types";
import { C } from "../utils/constants";
import { money } from "../utils/calculations";
import { Avatar } from "./Atoms";

interface BalanceViewProps {
  trip: Trip;
  currentUser: Member;
  currentUserId: string;
  userStats: {
    paid: number;
    share: number;
    net: number;
  };
  simplifiedDebts: Debt[];
  onOpenSettleModal: (preselectedDebtorId?: string, preselectedCreditorId?: string, preselectedAmount?: number) => void;
  onSendWhatsAppReminder?: (debtor: Member, amount: number) => void;
  onConfirmPayment: (paymentId: string) => void;
  onRejectPayment: (paymentId: string) => void;
}

export function BalanceView({
  trip,
  currentUser,
  currentUserId,
  userStats,
  simplifiedDebts,
  onOpenSettleModal,
  onConfirmPayment,
  onRejectPayment,
}: BalanceViewProps) {
  const [activeTab, setActiveTab] = useState<"smart" | "history">("smart");

  // Helper to check if an identifier matches current logged-in user
  const isMe = (id?: string) => {
    if (!id) return false;
    if (id === currentUserId || id === currentUser.id) return true;
    if (currentUser.userId && id === currentUser.userId) return true;
    if (currentUser.name && id.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) return true;
    return false;
  };

  const resolveMember = (id?: string) => {
    if (!id) return undefined;
    return trip.members.find(
      (m) =>
        m.id === id ||
        (m.userId && m.userId === id) ||
        (m.name && m.name.trim().toLowerCase() === id.trim().toLowerCase())
    );
  };

  // User debts
  const userOwes = simplifiedDebts.filter((d) => isMe(d.from));
  const userReceives = simplifiedDebts.filter((d) => isMe(d.to));

  // Payments list
  const payments = trip.payments || [];
  const completedPayments = payments.filter((p) => p.status === "PAID" || p.status === "confirmed");

  return (
    <div className="flex flex-col gap-4">
      {/* 1. HERO NET BANNER */}
      <div className="bg-[var(--c-card)] border border-[var(--c-line)] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-4">
        {/* Status Title & Number */}
        <div className="text-center py-1">
          <div
            className={`text-xs font-bold uppercase tracking-wider ${
              userStats.net > 0.01
                ? "text-emerald-700"
                : userStats.net < -0.01
                ? "text-[var(--c-rust)]"
                : simplifiedDebts.length > 0
                ? "text-amber-500"
                : "text-[var(--c-teal)]"
            }`}
          >
            {userStats.net > 0.01
              ? "You are owed money"
              : userStats.net < -0.01
              ? "You owe money"
              : simplifiedDebts.length > 0
              ? "Your dues cleared • Group has pending settlements"
              : "All Settled Up"}
          </div>

          <div
            className={`text-3xl sm:text-4xl font-extrabold mt-1 tracking-tight ${
              userStats.net > 0.01
                ? "text-emerald-700"
                : userStats.net < -0.01
                ? "text-[var(--c-rust)]"
                : "text-[var(--c-ink)]"
            }`}
          >
            {userStats.net > 0.01
              ? `+${money(userStats.net)}`
              : userStats.net < -0.01
              ? `-${money(Math.abs(userStats.net))}`
              : simplifiedDebts.length > 0
              ? "₹0.00 (You're Settled)"
              : "All Settled Up"}
          </div>

          <div className="text-xs sm:text-sm text-[var(--c-inkSoft)] mt-1">
            {userStats.net > 0.01
              ? `You paid ${money(userStats.paid)} upfront for group expenses`
              : userStats.net < -0.01
              ? `Your total consumption share is ${money(userStats.share)}`
              : simplifiedDebts.length > 0
              ? `${simplifiedDebts.length} pending settlement transaction(s) among members`
              : "No pending dues in this trip"}
          </div>
        </div>

        {/* Breakdown of who owes you / who you owe */}
        {userStats.net > 0.01 && userReceives.length > 0 && (
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
              Members who owe you:
            </div>
            {userReceives.map((d, idx) => {
              const debtor = resolveMember(d.from);
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 bg-[var(--c-card)] p-2.5 sm:p-3 rounded-lg border border-[var(--c-line)]"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar member={debtor} name={debtor?.name || d.from} size={32} />
                    <div>
                      <div className="text-sm font-semibold text-[var(--c-ink)]">
                        {debtor?.name || d.from}
                      </div>
                      <div className="text-xs text-[var(--c-inkSoft)]">
                        owes you <b className="text-emerald-700">{money(d.amount)}</b>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenSettleModal(debtor?.id || d.from, currentUser.id, d.amount)}
                    className="px-3 py-1.5 text-xs font-semibold text-[var(--c-teal-contrast-text)] bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    Record Received
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {userStats.net < -0.01 && userOwes.length > 0 && (
          <div className="bg-[var(--c-rustSoft)]/50 border border-[var(--c-rust)] rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="text-xs font-bold text-[var(--c-rust)] uppercase tracking-wide">
              You owe:
            </div>
            {userOwes.map((d, idx) => {
              const creditor = resolveMember(d.to);
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 bg-[var(--c-card)] p-2.5 sm:p-3 rounded-lg border border-[var(--c-line)]"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar member={creditor} name={creditor?.name || d.to} size={32} />
                    <div>
                      <div className="text-sm font-semibold text-[var(--c-ink)]">
                        {creditor?.name || d.to}
                      </div>
                      <div className="text-xs text-[var(--c-inkSoft)]">
                        Amount: <b className="text-[var(--c-rust)]">{money(d.amount)}</b>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenSettleModal(currentUser.id, creditor?.id || d.to, d.amount)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-[var(--c-teal-contrast-text)] bg-[var(--c-ink)] hover:bg-[var(--c-inkSoft)] rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Record Paid
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Global Settle Up Trigger Button */}
        <button
          id="btn-open-settle-modal"
          type="button"
          onClick={() => onOpenSettleModal()}
          className="w-full py-3 px-4 bg-teal-800 hover:bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] text-sm font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>Record Settlement Payment</span>
        </button>
      </div>

      {/* 2. TAB SWITCHER: SMART SETTLEMENT vs PAYMENT HISTORY */}
      <div className="grid grid-cols-2 bg-[var(--c-lineSoft)] p-1 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("smart")}
          className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === "smart"
              ? "bg-[var(--c-card)] text-[var(--c-ink)] shadow-xs"
              : "text-[var(--c-inkSoft)] hover:text-[var(--c-ink)]"
          }`}
        >
          Suggested Settlements ({simplifiedDebts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === "history"
              ? "bg-[var(--c-card)] text-[var(--c-ink)] shadow-xs"
              : "text-[var(--c-inkSoft)] hover:text-[var(--c-ink)]"
          }`}
        >
          Settlement History ({completedPayments.length})
        </button>
      </div>

      {/* 3. TAB CONTENT: SMART SETTLEMENT */}
      {activeTab === "smart" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--c-ink)]">
                Minimum Debt Settlements
              </h2>
              <div className="text-xs text-[var(--c-inkSoft)]">
                {simplifiedDebts.length} transaction(s) to settle all member balances
              </div>
            </div>

            <span className="text-xs font-semibold text-[var(--c-teal)] bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
              Optimal Graph
            </span>
          </div>

          {simplifiedDebts.length === 0 ? (
            <div className="bg-[var(--c-card)] border border-dashed border-[var(--c-line)] rounded-xl p-8 text-center">
              <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto mb-2" />
              <div className="text-sm font-bold text-[var(--c-ink)]">All Accounts Cleared</div>
              <div className="text-xs text-[var(--c-inkSoft)] mt-1">
                No one in this trip owes any money.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {simplifiedDebts.map((debt, idx) => {
                const debtor = resolveMember(debt.from);
                const creditor = resolveMember(debt.to);
                const isUserDebtor = isMe(debt.from);
                const isUserCreditor = isMe(debt.to);

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
                      isUserDebtor
                        ? "bg-[var(--c-rustSoft)]/30 border-[var(--c-rust)]"
                        : isUserCreditor
                        ? "bg-emerald-50/30 border-emerald-200"
                        : "bg-[var(--c-card)] border-[var(--c-line)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar member={debtor} name={debtor?.name || debt.from} size={36} />
                      <div>
                        <div className="text-sm font-semibold text-[var(--c-ink)] flex items-center gap-1.5">
                          <span>{debtor?.name || debt.from} {isUserDebtor && "(You)"}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[var(--c-inkSoft)]" />
                          <span>{creditor?.name || debt.to} {isUserCreditor && "(You)"}</span>
                        </div>
                        <div className="text-xs text-[var(--c-inkSoft)] mt-0.5">
                          {isUserDebtor
                            ? "You owe this amount"
                            : isUserCreditor
                            ? "You will receive this amount"
                            : "Direct group settlement"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--c-lineSoft)]">
                      <div className="text-base font-bold text-[var(--c-ink)]">
                        {money(debt.amount)}
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenSettleModal(debt.from, debt.to, debt.amount)}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer ${
                          isUserDebtor
                            ? "bg-[var(--c-ink)] hover:bg-[var(--c-inkSoft)] text-[var(--c-teal-contrast-text)]"
                            : "bg-teal-700 hover:bg-teal-800 text-[var(--c-teal-contrast-text)]"
                        }`}
                      >
                        Record Settlement
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB CONTENT: SETTLEMENT HISTORY */}
      {activeTab === "history" && (
        <div className="flex flex-col gap-3">
          {completedPayments.length === 0 ? (
            <div className="bg-[var(--c-card)] border border-dashed border-[var(--c-line)] rounded-xl p-8 text-center">
              <Clock className="w-8 h-8 text-[var(--c-inkSoft)] mx-auto mb-2" />
              <div className="text-sm font-medium text-[var(--c-ink)]">No Settlement History</div>
              <div className="text-xs text-[var(--c-inkSoft)] mt-1">
                Completed settlement payments will be archived here.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {completedPayments.map((p) => {
                const debtor = trip.members.find((m) => m.id === (p.fromUserId || p.from));
                const creditor = trip.members.find((m) => m.id === (p.toUserId || p.to));

                return (
                  <div
                    key={p.id}
                    className="p-3.5 bg-[var(--c-card)] border border-[var(--c-line)] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <Avatar member={debtor} size={32} />
                        <Avatar member={creditor} size={32} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[var(--c-ink)] flex items-center gap-1.5">
                          <span>{debtor?.name || "Sender"}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[var(--c-inkSoft)]" />
                          <span>{creditor?.name || "Recipient"}</span>
                        </div>
                        <div className="text-xs text-[var(--c-inkSoft)] mt-0.5">
                          {p.ts || p.createdAt?.split("T")[0] || "Settled"} {p.note ? `• ${p.note}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold text-[var(--c-ink)]">
                          {money(p.amount)}
                        </div>
                        <div className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" />
                          Settled
                        </div>
                      </div>
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
