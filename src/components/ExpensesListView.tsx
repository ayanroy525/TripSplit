import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Receipt,
  Utensils,
  Car,
  Hotel,
  Ticket,
  ShoppingBag,
  MoreHorizontal,
  Calendar,
  Users,
  Split,
  Percent,
  Calculator,
  Scale,
  Sparkles,
} from "lucide-react";
import { Expense, Member, SplitMethod } from "../types";
import { money, formatDate } from "../utils/calculations";
import { Avatar } from "./Atoms";
import { CATEGORY_META, getCategoryMeta, PRIMARY_CATEGORIES } from "../utils/constants";

interface ExpensesListViewProps {
  expenses: Expense[];
  members: Member[];
  currentUserId: string;
  currency?: string;
  onOpenAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  Food: Utensils,
  Transport: Car,
  Accommodation: Hotel,
  Activities: Ticket,
  Shopping: ShoppingBag,
  Groceries: Receipt,
  Others: MoreHorizontal,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Food: { bg: "#FEF3C7", text: "#92400E" },
  Transport: { bg: "#DBEAFE", text: "#1E40AF" },
  Accommodation: { bg: "#E0E7FF", text: "#3730A3" },
  Activities: { bg: "#FCE7F3", text: "#9D174D" },
  Shopping: { bg: "#F3E8FF", text: "#6B21A8" },
  Groceries: { bg: "#DCFCE7", text: "#166534" },
  Others: { bg: "#F1F5F9", text: "#334155" },
};

export function ExpensesListView({
  expenses,
  members,
  currentUserId,
  currency = "INR",
  onOpenAddExpense,
  onEditExpense,
  onDeleteExpense,
}: ExpensesListViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPayer, setSelectedPayer] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeExpenses = useMemo(() => expenses.filter((e) => !e.deleted), [expenses]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Categories present in expenses
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: activeExpenses.length };
    activeExpenses.forEach((e) => {
      const meta = getCategoryMeta(e.category, e.title);
      const cat = meta.resolvedCategory;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [activeExpenses]);

  // Filtered & Sorted Expenses
  const filteredExpenses = useMemo(() => {
    return activeExpenses
      .filter((e) => {
        const meta = getCategoryMeta(e.category, e.title);

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = e.title.toLowerCase().includes(q);
          const matchNotes = (e.notes || "").toLowerCase().includes(q);
          const payerMember =
            memberMap.get(e.paidBy) ||
            members.find((m) => m.userId === e.paidBy || (m.name && m.name.toLowerCase() === (e.paidBy || "").toLowerCase()));
          const payerName = payerMember?.name.toLowerCase() || "";
          const matchPayer = payerName.includes(q);
          const matchCat =
            meta.resolvedCategory.toLowerCase().includes(q) || (e.category || "").toLowerCase().includes(q);
          if (!matchTitle && !matchNotes && !matchPayer && !matchCat) return false;
        }

        // Category filter
        if (selectedCategory !== "all") {
          if (meta.resolvedCategory !== selectedCategory && e.category !== selectedCategory) {
            return false;
          }
        }

        // Payer filter
        if (selectedPayer !== "all") {
          if (e.payers) {
            if (!e.payers[selectedPayer]) return false;
          } else {
            const payerMember =
              memberMap.get(e.paidBy) ||
              members.find((m) => m.userId === e.paidBy || (m.name && m.name.toLowerCase() === (e.paidBy || "").toLowerCase()));
            const isMatch =
              e.paidBy === selectedPayer ||
              (payerMember && (payerMember.id === selectedPayer || payerMember.userId === selectedPayer));
            if (!isMatch) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_desc") {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        } else if (sortBy === "date_asc") {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        } else if (sortBy === "amount_desc") {
          return b.amount - a.amount;
        } else if (sortBy === "amount_asc") {
          return a.amount - b.amount;
        }
        return 0;
      });
  }, [activeExpenses, searchQuery, selectedCategory, selectedPayer, sortBy, memberMap, members]);

  const totalFilteredAmount = useMemo(
    () => filteredExpenses.reduce((s, e) => s + e.amount, 0),
    [filteredExpenses]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--c-card)] p-4 rounded-2xl border border-[var(--c-line)] shadow-xs">
        <div>
          <h2 className="text-base font-bold text-[var(--c-ink)] flex items-center gap-2">
            <span>Expenses Ledger</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-[var(--c-teal)] font-bold border border-teal-200">
              {filteredExpenses.length} entries
            </span>
          </h2>
          <div className="text-xs text-[var(--c-inkSoft)] mt-0.5">
            Filtered Total: <span className="font-bold text-[var(--c-ink)]">{money(totalFilteredAmount, currency)}</span>
          </div>
        </div>

        <button
          id="btn-add-expense-top"
          type="button"
          onClick={onOpenAddExpense}
          className="px-4 py-2.5 bg-[var(--c-teal)] hover:bg-[var(--c-tealDark)] text-[var(--c-teal-contrast-text)] rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus size={15} />
          <span>Add Expense</span>
        </button>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="flex flex-col gap-2.5 bg-[var(--c-card)] p-4 rounded-2xl border border-[var(--c-line)] shadow-xs">
        {/* Search input & Sort */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="sm:col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-inkSoft)]" />
            <input
              type="text"
              placeholder="Search expenses by title, notes, or payer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-xl text-xs font-medium text-[var(--c-ink)] focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-xl text-xs font-semibold text-[var(--c-inkSoft)] focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none cursor-pointer"
            >
              <option value="date_desc">📅 Newest Date First</option>
              <option value="date_asc">📅 Oldest Date First</option>
              <option value="amount_desc">💰 Highest Amount First</option>
              <option value="amount_asc">💰 Lowest Amount First</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === "all"
                ? "bg-[var(--c-ink)] text-[var(--c-teal-contrast-text)] shadow-xs"
                : "bg-[var(--c-lineSoft)] text-[var(--c-inkSoft)] hover:bg-[var(--c-line)]"
            }`}
          >
            All ({activeExpenses.length})
          </button>

          {PRIMARY_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat] || 0;
            if (count === 0 && selectedCategory !== cat) return null;
            const isSelected = selectedCategory === cat;
            const meta = CATEGORY_META[cat] || CATEGORY_META["Other"];
            const Icon = meta.icon;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] shadow-xs"
                    : "bg-[var(--c-lineSoft)] text-[var(--c-inkSoft)] hover:bg-[var(--c-line)]"
                }`}
              >
                <Icon size={12} />
                <span>{cat}</span>
                <span className="opacity-70 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Expenses List Cards */}
      {filteredExpenses.length === 0 ? (
        <div className="bg-[var(--c-card)] border border-[var(--c-line)] rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-[var(--c-teal)] flex items-center justify-center">
            <Receipt size={24} />
          </div>
          <div>
            <div className="text-sm font-bold text-[var(--c-ink)]">No expenses found</div>
            <div className="text-xs text-[var(--c-inkSoft)] mt-0.5">
              {searchQuery || selectedCategory !== "all"
                ? "Try adjusting your search terms or filters."
                : "Start tracking shared trip costs by logging your first expense."}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAddExpense}
            className="mt-2 px-4 py-2 bg-[var(--c-teal)] hover:bg-[var(--c-tealDark)] text-[var(--c-teal-contrast-text)] rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Expense</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredExpenses.map((expense) => {
            const isExpanded = expandedId === expense.id;
            const meta = getCategoryMeta(expense.category, expense.title);
            const Icon = meta.icon;
            const colors = { bg: meta.bg || "#F1F5F9", text: meta.text || meta.color };

            // Payer resolution
            let payerLabel = "";
            let payerAvatar: Member | undefined = undefined;

            const currentUserMember = members.find((m) => m.id === currentUserId || m.userId === currentUserId);

            if (expense.payers && Object.keys(expense.payers).length > 1) {
              payerLabel = `Multi-Payer (${Object.keys(expense.payers).length})`;
            } else {
              const pId = expense.payers ? Object.keys(expense.payers)[0] : expense.paidBy;
              const payerMember =
                memberMap.get(pId) ||
                members.find((m) => m.userId === pId || (m.name && m.name.toLowerCase() === (pId || "").toLowerCase()));
              payerAvatar = payerMember;
              const isPaidByMe =
                pId === currentUserId ||
                (currentUserMember && (pId === currentUserMember.id || pId === currentUserMember.userId)) ||
                (payerMember && currentUserMember && (payerMember.id === currentUserMember.id || (payerMember.name && currentUserMember.name && payerMember.name.trim().toLowerCase() === currentUserMember.name.trim().toLowerCase())));
              payerLabel = isPaidByMe ? "You" : payerMember ? `${payerMember.name}` : pId;
            }

            // User's own share in this expense
            const myShare =
              expense.splits[currentUserId] ||
              (currentUserMember ? expense.splits[currentUserMember.id] : 0) ||
              (currentUserMember?.userId ? expense.splits[currentUserMember.userId] : 0) ||
              0;

            return (
              <div
                key={expense.id}
                className="bg-[var(--c-card)] border border-[var(--c-line)] rounded-2xl p-4 shadow-xs hover:border-[var(--c-line)] transition-all flex flex-col gap-3"
              >
                {/* Top Row: Category Icon + Title + Amount */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      <Icon size={18} />
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[var(--c-ink)] truncate">{expense.title}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--c-inkSoft)] mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} className="text-[var(--c-inkSoft)]" />
                          <span>{formatDate(expense.date)}</span>
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-[var(--c-inkSoft)]">{meta.resolvedCategory}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base font-extrabold text-[var(--c-ink)] tracking-tight">
                      {money(expense.amount, currency)}
                    </div>
                    {myShare > 0 && (
                      <div className="text-[11px] font-bold text-[var(--c-teal)] bg-teal-50 px-2 py-0.5 rounded-md mt-0.5">
                        Your share: {money(myShare, currency)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Middle Row: Payer & Split Method Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--c-lineSoft)] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--c-inkSoft)] font-medium">Paid by:</span>
                    <div className="flex items-center gap-1.5 bg-[var(--c-paperDark)] px-2 py-1 rounded-lg border border-[var(--c-line)]">
                      {payerAvatar && <Avatar name={payerAvatar.name} color={payerAvatar.avatarColor} size={18} />}
                      <span className="font-bold text-[var(--c-ink)]">{payerLabel}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-[var(--c-lineSoft)] text-[var(--c-inkSoft)] text-[11px] font-semibold uppercase tracking-wider">
                      {expense.method}
                    </span>
                    <span className="text-[11px] text-[var(--c-inkSoft)]">
                      {expense.participants.length} people
                    </span>
                  </div>
                </div>

                {/* Notes if any */}
                {expense.notes && (
                  <div className="text-xs text-[var(--c-inkSoft)] italic bg-[var(--c-paperDark)]/70 p-2 rounded-lg">
                    "{expense.notes}"
                  </div>
                )}

                {/* Expandable Split Breakdown Drawer */}
                {isExpanded && (
                  <div className="bg-[var(--c-paperDark)] p-3 rounded-xl border border-[var(--c-line)] flex flex-col gap-2 text-xs">
                    <div className="font-bold text-[var(--c-ink)] flex items-center justify-between">
                      <span>Itemized Member Breakdown:</span>
                      <span className="text-[var(--c-inkSoft)] font-normal">Method: {expense.method}</span>
                    </div>

                    {/* Multi-Payer Breakdown if applicable */}
                    {expense.payers && Object.keys(expense.payers).length > 1 && (
                      <div className="p-2 bg-[var(--c-card)] rounded-lg border border-[var(--c-line)]">
                        <div className="font-bold text-[var(--c-inkSoft)] mb-1 text-[11px]">Upfront Payers:</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {Object.entries(expense.payers).map(([pid, amt]) => {
                            const m = memberMap.get(pid);
                            return (
                              <div key={pid} className="flex items-center justify-between text-[11px]">
                                <span className="text-[var(--c-inkSoft)]">{m?.name || pid}:</span>
                                <span className="font-bold text-emerald-700">{money(amt, currency)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Participant Shares */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {expense.participants.map((pid) => {
                        const m = memberMap.get(pid);
                        const share = expense.splits[pid] || 0;
                        const isMe = pid === currentUserId;
                        return (
                          <div
                            key={pid}
                            className={`p-2 rounded-lg flex items-center justify-between ${
                              isMe ? "bg-teal-50 border border-teal-200 font-bold" : "bg-[var(--c-card)] border border-[var(--c-line)]"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <Avatar name={m?.name || pid} color={m?.avatarColor || "#0F6B65"} size={18} />
                              <span className="truncate">{m?.name || pid}</span>
                            </div>
                            <span className={isMe ? "text-[var(--c-teal)]" : "text-[var(--c-inkSoft)] font-semibold"}>
                              {money(share, currency)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Bottom Actions: View Splits + Edit + Delete */}
                <div className="flex items-center justify-between pt-1 border-t border-[var(--c-lineSoft)]">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                    className="text-xs font-semibold text-[var(--c-teal)] hover:text-teal-950 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{isExpanded ? "Hide Details" : "View Split Details"}</span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditExpense(expense)}
                      className="p-1.5 text-[var(--c-inkSoft)] hover:text-[var(--c-ink)] hover:bg-[var(--c-lineSoft)] rounded-lg transition-colors cursor-pointer"
                      title="Edit Expense"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete expense "${expense.title}"?`)) {
                          onDeleteExpense(expense.id);
                        }
                      }}
                      className="p-1.5 text-[var(--c-inkSoft)] hover:text-[var(--c-rust)] hover:bg-[var(--c-rustSoft)] rounded-lg transition-colors cursor-pointer"
                      title="Delete Expense"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
