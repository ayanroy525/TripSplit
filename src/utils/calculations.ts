import { Member, Expense, Payment, SimplifiedDebt } from "../types";

export const uid = (p = "id") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** Converts a floating point amount to integer cents/paise */
export const toCents = (n: number): number => Math.round((Number(n) || 0) * 100);

/** Converts integer cents/paise back to 2-decimal float */
export const fromCents = (c: number): number => Math.round(c) / 100;

/** Round to exact 2 decimal places */
export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Currency Formatter */
export const money = (n: number | undefined | null, currency = "INR") => {
  const val = Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₹";
  return `${symbol}${val.toLocaleString("en-IN", {
    minimumFractionDigits: val % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

export const nowStr = () => {
  const d = new Date();
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

/**
 * 1. EQUAL SPLIT:
 * Splits an amount equally between participants with exact paisa/cent rounding
 * so sum(splits) === exact amount.
 */
export function equalSplit(amount: number, participantIds: string[]): Record<string, number> {
  if (!participantIds.length || amount <= 0) return {};
  const totalCents = toCents(amount);
  const n = participantIds.length;
  const baseCents = Math.floor(totalCents / n);
  let remainderCents = totalCents - baseCents * n;

  const splits: Record<string, number> = {};
  participantIds.forEach((id) => {
    let personCents = baseCents;
    if (remainderCents > 0) {
      personCents += 1;
      remainderCents--;
    }
    splits[id] = fromCents(personCents);
  });

  return splits;
}

/**
 * 2. PERCENTAGE SPLIT:
 * Splits an amount based on custom % shares per participant.
 * Distributes remainder cents to highest percentage holders to guarantee exact match.
 */
export function percentageSplit(
  amount: number,
  percentages: Record<string, number>,
  participantIds: string[]
): Record<string, number> {
  if (!participantIds.length || amount <= 0) return {};
  const totalCents = toCents(amount);
  const splits: Record<string, number> = {};
  let distributedCents = 0;

  // Calculate raw cents
  const items = participantIds.map((id) => {
    const pct = percentages[id] || 0;
    const rawCents = Math.floor((totalCents * pct) / 100);
    distributedCents += rawCents;
    return { id, pct, rawCents };
  });

  let remainderCents = totalCents - distributedCents;
  // Sort descending by percentage to distribute remainder cents fairly
  items.sort((a, b) => b.pct - a.pct);

  items.forEach((item, index) => {
    let finalCents = item.rawCents;
    if (index < remainderCents) {
      finalCents += 1;
    }
    splits[item.id] = fromCents(finalCents);
  });

  return splits;
}

/**
 * 3. SHARES / WEIGHTS SPLIT:
 * Splits an amount based on integer share ratios (e.g., Alice: 2 shares, Bob: 1 share).
 */
export function sharesSplit(
  amount: number,
  shares: Record<string, number>,
  participantIds: string[]
): Record<string, number> {
  if (!participantIds.length || amount <= 0) return {};
  const totalCents = toCents(amount);
  const totalShares = participantIds.reduce((sum, id) => sum + (Math.max(1, shares[id] || 1)), 0);

  if (totalShares <= 0) return equalSplit(amount, participantIds);

  const splits: Record<string, number> = {};
  let distributedCents = 0;

  const items = participantIds.map((id) => {
    const userShare = Math.max(1, shares[id] || 1);
    const rawCents = Math.floor((totalCents * userShare) / totalShares);
    distributedCents += rawCents;
    return { id, userShare, rawCents };
  });

  let remainderCents = totalCents - distributedCents;
  items.sort((a, b) => b.userShare - a.userShare);

  items.forEach((item, index) => {
    let finalCents = item.rawCents;
    if (index < remainderCents) {
      finalCents += 1;
    }
    splits[item.id] = fromCents(finalCents);
  });

  return splits;
}

/**
 * Computes paid vs share balances and final net for each member.
 * Supports both single-payer (expense.paidBy) and multi-payer (expense.payers).
 * Settlements adjust the outstanding net balance.
 */
export function computeBalances(
  members: Member[],
  expenses: Expense[],
  payments: Payment[]
) {
  const bal: Record<string, { paid: number; share: number }> = {};
  members.forEach((m) => (bal[m.id] = { paid: 0, share: 0 }));

  expenses
    .filter((e) => !e.deleted)
    .forEach((e) => {
      // 1. Credit Payer(s)
      if (e.payers && Object.keys(e.payers).length > 0) {
        Object.entries(e.payers).forEach(([pid, paidAmt]) => {
          if (bal[pid]) {
            bal[pid].paid = round2(bal[pid].paid + (Number(paidAmt) || 0));
          }
        });
      } else if (bal[e.paidBy]) {
        bal[e.paidBy].paid = round2(bal[e.paidBy].paid + e.amount);
      }

      // 2. Debit Participants (their fair share)
      Object.entries(e.splits || {}).forEach(([id, amt]) => {
        if (bal[id]) {
          bal[id].share = round2(bal[id].share + (Number(amt) || 0));
        }
      });
    });

  // 3. Compute Base Net Balance: Paid - Share
  const net: Record<string, number> = {};
  members.forEach((m) => {
    net[m.id] = round2((bal[m.id]?.paid || 0) - (bal[m.id]?.share || 0));
  });

  // 4. Apply confirmed/paid settlements
  (payments || [])
    .filter((p) => p.status === "PAID" || p.status === "confirmed")
    .forEach((p) => {
      if (net[p.from] !== undefined) {
        // Debtor paid money -> net increases toward 0
        net[p.from] = round2(net[p.from] + p.amount);
      }
      if (net[p.to] !== undefined) {
        // Creditor received money -> net decreases toward 0
        net[p.to] = round2(net[p.to] - p.amount);
      }
    });

  return { paidShare: bal, net };
}

/**
 * Greedy Min-Cash-Flow debt simplification algorithm to minimize total number of settlement transactions.
 */
export function simplifyDebts(net: Record<string, number>): SimplifiedDebt[] {
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0.01)
    .map(([id, v]) => ({ id, amt: round2(v) }))
    .sort((a, b) => b.amt - a.amt);

  const debtors = Object.entries(net)
    .filter(([, v]) => v < -0.01)
    .map(([id, v]) => ({ id, amt: round2(-v) }))
    .sort((a, b) => b.amt - a.amt);

  const txns: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = round2(Math.min(debtor.amt, creditor.amt));

    if (pay > 0.009) {
      txns.push({
        id: uid("txn"),
        from: debtor.id,
        to: creditor.id,
        amount: pay,
      });
    }

    debtor.amt = round2(debtor.amt - pay);
    creditor.amt = round2(creditor.amt - pay);

    if (debtor.amt <= 0.009) i++;
    if (creditor.amt <= 0.009) j++;
  }

  return txns;
}

/**
 * Computes deep analytics summaries for a trip.
 */
export function computeTripAnalytics(
  members: Member[],
  expenses: Expense[],
  payments: Payment[]
) {
  const activeExpenses = expenses.filter((e) => !e.deleted);
  const totalSpend = activeExpenses.reduce((s, e) => s + e.amount, 0);

  // Category breakdown
  const categoryMap: Record<string, { count: number; total: number }> = {};
  activeExpenses.forEach((e) => {
    const cat = e.category || "Others";
    if (!categoryMap[cat]) categoryMap[cat] = { count: 0, total: 0 };
    categoryMap[cat].count += 1;
    categoryMap[cat].total = round2(categoryMap[cat].total + e.amount);
  });

  const categoryBreakdown = Object.entries(categoryMap)
    .map(([category, data]) => ({
      category,
      count: data.count,
      total: data.total,
      percentage: totalSpend > 0 ? round2((data.total / totalSpend) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Member spending & shares
  const { paidShare, net } = computeBalances(members, activeExpenses, payments);
  const memberAnalytics = members.map((m) => {
    const ps = paidShare[m.id] || { paid: 0, share: 0 };
    return {
      memberId: m.id,
      name: m.name,
      avatarColor: m.avatarColor,
      role: m.role,
      paid: ps.paid,
      share: ps.share,
      net: net[m.id] || 0,
      paidPercent: totalSpend > 0 ? round2((ps.paid / totalSpend) * 100) : 0,
      sharePercent: totalSpend > 0 ? round2((ps.share / totalSpend) * 100) : 0,
    };
  });

  // Top Spender
  const topSpender = [...memberAnalytics].sort((a, b) => b.paid - a.paid)[0] || null;
  // Highest single expense
  const highestExpense = [...activeExpenses].sort((a, b) => b.amount - a.amount)[0] || null;
  // Average expense amount
  const avgExpense = activeExpenses.length > 0 ? round2(totalSpend / activeExpenses.length) : 0;

  // Settlement completion percentage
  const confirmedPayments = payments.filter((p) => p.status === "PAID" || p.status === "confirmed");
  const totalSettledAmount = confirmedPayments.reduce((s, p) => s + p.amount, 0);

  return {
    totalSpend,
    expenseCount: activeExpenses.length,
    avgExpense,
    topSpender,
    highestExpense,
    categoryBreakdown,
    memberAnalytics,
    totalSettledAmount,
  };
}
