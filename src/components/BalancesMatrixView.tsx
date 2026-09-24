import React, { useMemo } from "react";
import {
  Scale,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Users,
  Grid3X3,
  ArrowRight,
  Info,
} from "lucide-react";
import { Trip, Member, Expense, Payment } from "../types";
import { money, round2 } from "../utils/calculations";
import { Avatar } from "./Atoms";

interface BalancesMatrixViewProps {
  trip: Trip;
  currentUser: Member;
  currentUserId: string;
  paidShare: Record<string, { paid: number; share: number }>;
  netBalances: Record<string, number>;
  onOpenSettleModal: (debtorId?: string, creditorId?: string, amount?: number) => void;
  onNavigateToSettlementPlan?: () => void;
}

export function BalancesMatrixView({
  trip,
  currentUser,
  currentUserId,
  paidShare,
  netBalances,
  onOpenSettleModal,
  onNavigateToSettlementPlan,
}: BalancesMatrixViewProps) {
  const members = trip.members || [];
  const totalSpend = useMemo(() => {
    return (trip.expenses || [])
      .filter((e) => !e.deleted)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [trip.expenses]);

  // Compute Pairwise Matrix: matrix[debtorId][creditorId] = net amount debtor owes creditor
  // From direct raw expense shares and direct payments
  const pairwiseMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    members.forEach((m1) => {
      matrix[m1.id] = {};
      members.forEach((m2) => {
        matrix[m1.id][m2.id] = 0;
      });
    });

    // 1. Traverse expenses
    (trip.expenses || [])
      .filter((e) => !e.deleted)
      .forEach((exp) => {
        // Multi-payer vs Single-payer
        const expensePayers: Record<string, number> = exp.payers && Object.keys(exp.payers).length > 0
          ? exp.payers
          : { [exp.paidBy]: exp.amount };

        const totalExpenseAmt = exp.amount || 1;

        Object.entries(expensePayers).forEach(([payerId, payerPaidAmt]) => {
          if (!matrix[payerId]) return;
          const payerFraction = payerPaidAmt / totalExpenseAmt;

          Object.entries(exp.splits || {}).forEach(([consumerId, consumerShare]) => {
            if (payerId === consumerId) return; // Self-consumption has no debt
            if (!matrix[consumerId]) return;
            // consumer owes payer (payerFraction * consumerShare)
            const debt = consumerShare * payerFraction;
            matrix[consumerId][payerId] = round2((matrix[consumerId][payerId] || 0) + debt);
          });
        });
      });

    // 2. Traverse confirmed/paid settlement payments
    (trip.payments || [])
      .filter((p) => p.status === "PAID" || p.status === "confirmed")
      .forEach((p) => {
        if (matrix[p.from] && matrix[p.from][p.to] !== undefined) {
          matrix[p.from][p.to] = round2(matrix[p.from][p.to] - p.amount);
        }
      });

    // 3. Net out pairwise mutual obligations (if A owes B $50 and B owes A $20 -> A owes B $30)
    members.forEach((m1) => {
      members.forEach((m2) => {
        if (m1.id >= m2.id) return;
        const d1to2 = matrix[m1.id][m2.id] || 0;
        const d2to1 = matrix[m2.id][m1.id] || 0;
        if (d1to2 >= d2to1) {
          matrix[m1.id][m2.id] = round2(d1to2 - d2to1);
          matrix[m2.id][m1.id] = 0;
        } else {
          matrix[m2.id][m1.id] = round2(d2to1 - d1to2);
          matrix[m1.id][m2.id] = 0;
        }
      });
    });

    return matrix;
  }, [members, trip.expenses, trip.payments]);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. SECTION HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--c-card)] p-5 rounded-2xl border border-[var(--c-line)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] flex items-center justify-center font-bold text-sm">
              <Scale size={16} />
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[var(--c-ink)] tracking-tight">
              Balances & Debt Matrix
            </h2>
          </div>
          <p className="text-xs text-[var(--c-inkSoft)] mt-1">
            Exact breakdown of total amount paid upfront vs fair consumption share for each traveler.
          </p>
        </div>

        {onNavigateToSettlementPlan && (
          <button
            type="button"
            onClick={onNavigateToSettlementPlan}
            className="px-4 py-2 bg-[var(--c-teal)] hover:bg-[var(--c-tealDark)] text-[var(--c-teal-contrast-text)] rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>View Settlement Plan</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* 2. MEMBER BALANCES CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member) => {
          const stats = paidShare[member.id] || { paid: 0, share: 0 };
          const net = netBalances[member.id] || 0;
          const isCurrent = member.id === currentUserId;
          const paidRatio = totalSpend > 0 ? (stats.paid / totalSpend) * 100 : 0;
          const shareRatio = totalSpend > 0 ? (stats.share / totalSpend) * 100 : 0;

          return (
            <div
              key={member.id}
              className={`bg-[var(--c-card)] rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all ${
                isCurrent
                  ? "border-teal-600/40 ring-2 ring-teal-600/10"
                  : "border-[var(--c-line)]"
              }`}
            >
              {/* Header: Avatar + Name + Net Tag */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={member.name} color={member.avatarColor} size={42} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-[var(--c-ink)]">{member.name}</span>
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-[var(--c-teal)]">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--c-inkSoft)] capitalize">{member.role || "Member"}</span>
                  </div>
                </div>

                <div
                  className={`px-2.5 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1 shrink-0 ${
                    net > 0.01
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : net < -0.01
                      ? "bg-[var(--c-rustSoft)] text-[var(--c-rust)] border border-[var(--c-rust)]"
                      : "bg-[var(--c-lineSoft)] text-[var(--c-inkSoft)]"
                  }`}
                >
                  {net > 0.01 ? (
                    <>
                      <TrendingUp size={12} />
                      <span>+{money(net, trip.currency)}</span>
                    </>
                  ) : net < -0.01 ? (
                    <>
                      <TrendingDown size={12} />
                      <span>-{money(Math.abs(net), trip.currency)}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={12} className="text-[var(--c-inkSoft)]" />
                      <span>Settled</span>
                    </>
                  )}
                </div>
              </div>

              {/* Stats Strip */}
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[var(--c-lineSoft)]">
                <div className="bg-[var(--c-paperDark)] p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold uppercase text-[var(--c-inkSoft)]">Total Paid</div>
                  <div className="text-sm font-extrabold text-[var(--c-ink)] mt-0.5">
                    {money(stats.paid, trip.currency)}
                  </div>
                  <div className="text-[10px] text-[var(--c-inkSoft)] mt-0.5">{paidRatio.toFixed(0)}% of total</div>
                </div>

                <div className="bg-[var(--c-paperDark)] p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold uppercase text-[var(--c-inkSoft)]">Fair Share</div>
                  <div className="text-sm font-extrabold text-[var(--c-ink)] mt-0.5">
                    {money(stats.share, trip.currency)}
                  </div>
                  <div className="text-[10px] text-[var(--c-inkSoft)] mt-0.5">{shareRatio.toFixed(0)}% of total</div>
                </div>
              </div>

              {/* Visual Balance Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-[var(--c-inkSoft)] mb-1">
                  <span>Paid: {stats.paid > 0 ? `${paidRatio.toFixed(0)}%` : "0%"}</span>
                  <span>Share: {stats.share > 0 ? `${shareRatio.toFixed(0)}%` : "0%"}</span>
                </div>
                <div className="h-1.5 w-full bg-[var(--c-lineSoft)] rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, paidRatio)}%` }}
                    title={`Paid ${paidRatio.toFixed(1)}%`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. PAIRWISE DEBT MATRIX TABLE */}
      <div className="bg-[var(--c-card)] rounded-2xl border border-[var(--c-line)] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--c-lineSoft)] text-[var(--c-ink)] flex items-center justify-center font-bold text-sm">
              <Grid3X3 size={16} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--c-ink)] tracking-tight">
                Pairwise Settlement Matrix
              </h3>
              <p className="text-xs text-[var(--c-inkSoft)]">
                Direct bilateral obligations before Min-Cash-Flow graph simplification.
              </p>
            </div>
          </div>
        </div>

        {/* Responsive Matrix Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-[var(--c-line)]">
                <th className="py-3 px-3 font-bold text-[var(--c-inkSoft)] uppercase text-[10px]">
                  Debtor (Row) \ Creditor (Col)
                </th>
                {members.map((m) => (
                  <th key={m.id} className="py-3 px-3 font-bold text-[var(--c-inkSoft)] text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Avatar name={m.name} color={m.avatarColor} size={24} />
                      <span className="truncate max-w-[70px]">{m.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((debtor) => (
                <tr key={debtor.id} className="border-b border-[var(--c-lineSoft)] hover:bg-[var(--c-paperDark)]/60 transition-colors">
                  <td className="py-3 px-3 font-bold text-[var(--c-ink)] flex items-center gap-2">
                    <Avatar name={debtor.name} color={debtor.avatarColor} size={24} />
                    <span className="truncate">{debtor.name}</span>
                  </td>
                  {members.map((creditor) => {
                    const isSelf = debtor.id === creditor.id;
                    const amountOwed = pairwiseMatrix[debtor.id]?.[creditor.id] || 0;

                    if (isSelf) {
                      return (
                        <td key={creditor.id} className="py-3 px-3 text-center bg-[var(--c-paperDark)]/80 text-[var(--c-line)]">
                          —
                        </td>
                      );
                    }

                    return (
                      <td key={creditor.id} className="py-3 px-3 text-center">
                        {amountOwed > 0.01 ? (
                          <button
                            type="button"
                            onClick={() => onOpenSettleModal(debtor.id, creditor.id, amountOwed)}
                            className="inline-block px-2 py-1 rounded-lg bg-[var(--c-rustSoft)] hover:bg-rose-100 text-[var(--c-rust)] font-extrabold border border-[var(--c-rust)] transition-colors cursor-pointer"
                            title={`${debtor.name} owes ${creditor.name} ${money(amountOwed, trip.currency)}. Click to record payment.`}
                          >
                            {money(amountOwed, trip.currency)}
                          </button>
                        ) : (
                          <span className="text-[var(--c-inkSoft)] font-medium">$0</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[11px] text-[var(--c-inkSoft)] bg-[var(--c-paperDark)] p-3 rounded-xl">
          <Info size={14} className="shrink-0 text-[var(--c-inkSoft)]" />
          <span>
            Reading the matrix: Find the person who owes money in the left column, then look across the row to find who they owe. Click any amount to record a settlement.
          </span>
        </div>
      </div>
    </div>
  );
}
