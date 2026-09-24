import React, { useState, useMemo } from "react";
import {
  Check,
  AlertCircle,
  Users,
  Utensils,
  Car,
  Hotel,
  Ticket,
  ShoppingBag,
  Receipt,
  MoreHorizontal,
  Split,
  Percent,
  Calculator,
  Scale,
  Calendar,
  Clock,
  CheckCircle2,
  FileText,
  UserPlus,
  Train,
  Plane,
  Fuel,
} from "lucide-react";
import { Expense, Member, SplitMethod } from "../types";
import { equalSplit, percentageSplit, sharesSplit, money, round2, toCents, fromCents, uid } from "../utils/calculations";
import { Avatar, ModalShell } from "./Atoms";
import { getCategoryMeta } from "../utils/constants";

interface ExpenseFormModalProps {
  members: Member[];
  initialExpense?: Expense | null;
  currentUserId: string;
  onSave: (expense: Expense) => void;
  onClose: () => void;
}

const CATEGORY_OPTIONS = [
  { id: "Food", name: "Food & Dining", icon: Utensils, bg: "#FEF3C7", text: "#92400E" },
  { id: "Transport", name: "Transport & Cabs", icon: Car, bg: "#DBEAFE", text: "#1E40AF" },
  { id: "Travel", name: "Travel & Flights", icon: Plane, bg: "#E0F2FE", text: "#0369A1" },
  { id: "Train", name: "Train & Rail", icon: Train, bg: "#E6F4F2", text: "#0B4F4B" },
  { id: "Accommodation", name: "Accommodation & Hotel", icon: Hotel, bg: "#E0E7FF", text: "#3730A3" },
  { id: "Tickets", name: "Tickets & Passes", icon: Ticket, bg: "#FCE7F3", text: "#9D174D" },
  { id: "Activities", name: "Activities & Sightseeing", icon: Ticket, bg: "#FCE7F3", text: "#9D174D" },
  { id: "Shopping", name: "Shopping", icon: ShoppingBag, bg: "#F3E8FF", text: "#6B21A8" },
  { id: "Fuel", name: "Fuel & Petrol", icon: Fuel, bg: "#FEF3C7", text: "#B45309" },
  { id: "Groceries", name: "Groceries & Supplies", icon: Receipt, bg: "#DCFCE7", text: "#166534" },
  { id: "Others", name: "Others", icon: MoreHorizontal, bg: "#F1F5F9", text: "#334155" },
];

export function ExpenseFormModal({
  members,
  initialExpense,
  currentUserId,
  onSave,
  onClose,
}: ExpenseFormModalProps) {
  const [title, setTitle] = useState(initialExpense?.title || "");
  const [category, setCategory] = useState(initialExpense?.category || "Food");

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!initialExpense && (category === "Food" || category === "Others")) {
      const meta = getCategoryMeta(category, val);
      if (meta.resolvedCategory !== "Food" && meta.resolvedCategory !== "Other") {
        setCategory(meta.resolvedCategory);
      }
    }
  };
  const [amount, setAmount] = useState(initialExpense?.amount ? initialExpense.amount.toString() : "");
  const [date, setDate] = useState(
    initialExpense?.date || new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState(initialExpense?.notes || "");
  const [errorMsg, setErrorMsg] = useState("");

  // Payer Mode: Single Payer vs Multi-Payer
  const [isMultiPayer, setIsMultiPayer] = useState<boolean>(
    Boolean(initialExpense?.payers && Object.keys(initialExpense.payers).length > 1)
  );

  // Single payer ID
  const [singlePayerId, setSinglePayerId] = useState<string>(
    initialExpense?.paidBy && initialExpense.paidBy !== "multiple"
      ? initialExpense.paidBy
      : currentUserId
  );

  // Multi-payer amounts
  const [multiPayerVals, setMultiPayerVals] = useState<Record<string, string>>(() => {
    if (initialExpense?.payers) {
      const res: Record<string, string> = {};
      Object.entries(initialExpense.payers).forEach(([k, v]) => {
        res[k] = v.toString();
      });
      return res;
    }
    return { [currentUserId]: initialExpense?.amount ? initialExpense.amount.toString() : "" };
  });

  // Participants
  const [participants, setParticipants] = useState<string[]>(
    initialExpense?.participants || members.map((m) => m.id)
  );

  // Split Method
  const [method, setMethod] = useState<SplitMethod>(
    initialExpense?.method || "equal"
  );

  // Custom Exact Split amounts
  const [customVals, setCustomVals] = useState<Record<string, string>>(() => {
    if (initialExpense?.method === "custom" && initialExpense.splits) {
      const res: Record<string, string> = {};
      Object.entries(initialExpense.splits).forEach(([k, v]) => {
        res[k] = v.toString();
      });
      return res;
    }
    return {};
  });

  // Percentage values
  const [pctVals, setPctVals] = useState<Record<string, string>>(() => {
    if (initialExpense?.splitPercentages) {
      const res: Record<string, string> = {};
      Object.entries(initialExpense.splitPercentages).forEach(([k, v]) => {
        res[k] = v.toString();
      });
      return res;
    }
    if (initialExpense?.method === "percentage" && initialExpense.amount > 0) {
      const res: Record<string, string> = {};
      Object.entries(initialExpense.splits).forEach(([k, v]) => {
        res[k] = round2((v / initialExpense.amount) * 100).toString();
      });
      return res;
    }
    return {};
  });

  // Shares / Weights values
  const [sharesVals, setSharesVals] = useState<Record<string, string>>(() => {
    if (initialExpense?.splitShares) {
      const res: Record<string, string> = {};
      Object.entries(initialExpense.splitShares).forEach(([k, v]) => {
        res[k] = v.toString();
      });
      return res;
    }
    return {};
  });

  const numAmount = parseFloat(amount) || 0;

  // Participant management
  const toggleParticipant = (id: string) => {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };
  const selectAll = () => setParticipants(members.map((m) => m.id));
  const deselectAll = () => setParticipants([]);

  // Multi-Payer Sum Check
  const multiPayerSum = useMemo(() => {
    return Object.values(multiPayerVals).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  }, [multiPayerVals]);

  // Live Splits Calculation
  const calculatedSplits = useMemo(() => {
    const res: Record<string, number> = {};
    if (numAmount <= 0 || participants.length === 0) return res;

    if (method === "equal") {
      return equalSplit(numAmount, participants);
    } else if (method === "custom") {
      participants.forEach((id) => {
        res[id] = parseFloat(customVals[id]) || 0;
      });
      return res;
    } else if (method === "percentage") {
      const pctMap: Record<string, number> = {};
      participants.forEach((id) => {
        pctMap[id] = parseFloat(pctVals[id]) || 0;
      });
      return percentageSplit(numAmount, pctMap, participants);
    } else if (method === "shares") {
      const shareMap: Record<string, number> = {};
      participants.forEach((id) => {
        shareMap[id] = Math.max(1, parseInt(sharesVals[id]) || 1);
      });
      return sharesSplit(numAmount, shareMap, participants);
    }
    return res;
  }, [numAmount, participants, method, customVals, pctVals, sharesVals]);

  // Sum of current calculated splits
  const sumSplits = useMemo(() => {
    return round2(Object.values(calculatedSplits).reduce((s, v) => s + v, 0));
  }, [calculatedSplits]);

  const splitDifference = round2(numAmount - sumSplits);

  // Quick fix remainder for custom/percentage
  const handleAutoBalanceRemainder = () => {
    if (method === "custom" && participants.length > 0) {
      const firstId = participants[0];
      const currentFirstVal = parseFloat(customVals[firstId]) || 0;
      const newVal = round2(currentFirstVal + splitDifference);
      setCustomVals((prev) => ({ ...prev, [firstId]: Math.max(0, newVal).toString() }));
    } else if (method === "percentage" && participants.length > 0) {
      const totalPct = participants.reduce((s, id) => s + (parseFloat(pctVals[id]) || 0), 0);
      const diffPct = round2(100 - totalPct);
      const firstId = participants[0];
      const currentFirstVal = parseFloat(pctVals[firstId]) || 0;
      setPctVals((prev) => ({ ...prev, [firstId]: Math.max(0, round2(currentFirstVal + diffPct)).toString() }));
    }
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!title.trim()) {
      setErrorMsg("Please enter an expense title.");
      return;
    }

    if (numAmount <= 0) {
      setErrorMsg("Please enter a valid expense amount greater than 0.");
      return;
    }

    if (participants.length === 0) {
      setErrorMsg("Please select at least 1 participant to split this bill.");
      return;
    }

    // Payer Validation
    let finalPaidBy = singlePayerId;
    let finalPayers: Record<string, number> | undefined = undefined;

    if (isMultiPayer) {
      const payersRecord: Record<string, number> = {};
      let totalPaid = 0;
      Object.entries(multiPayerVals).forEach(([pid, val]) => {
        const amt = parseFloat(val) || 0;
        if (amt > 0) {
          payersRecord[pid] = amt;
          totalPaid = round2(totalPaid + amt);
        }
      });

      if (Object.keys(payersRecord).length === 0) {
        setErrorMsg("Please enter amounts for the members who paid.");
        return;
      }

      if (Math.abs(totalPaid - numAmount) > 0.05) {
        setErrorMsg(`Multi-payer amounts total (${money(totalPaid)}) must match bill total (${money(numAmount)}).`);
        return;
      }

      finalPaidBy = Object.keys(payersRecord).length === 1 ? Object.keys(payersRecord)[0] : "multiple";
      finalPayers = payersRecord;
    } else {
      if (!singlePayerId) {
        setErrorMsg("Please select who paid for this expense.");
        return;
      }
    }

    // Split Validation
    if (method === "custom" || method === "percentage") {
      if (Math.abs(splitDifference) > 0.05) {
        setErrorMsg(`Total allocated shares (${money(sumSplits)}) do not match expense total (${money(numAmount)}).`);
        return;
      }
    }

    const resolvedCat = getCategoryMeta(category, title).resolvedCategory;

    const payload: Expense = {
      id: initialExpense?.id || uid("exp"),
      tripId: initialExpense?.tripId,
      title: title.trim(),
      amount: numAmount,
      category: resolvedCat,
      date,
      paidBy: finalPaidBy,
      payers: finalPayers,
      createdBy: initialExpense?.createdBy || currentUserId,
      method,
      participants,
      splits: calculatedSplits,
      splitPercentages: method === "percentage" ? Object.fromEntries(participants.map((id) => [id, parseFloat(pctVals[id]) || 0])) : undefined,
      splitShares: method === "shares" ? Object.fromEntries(participants.map((id) => [id, parseInt(sharesVals[id]) || 1])) : undefined,
      notes: notes.trim() || undefined,
      createdAt: initialExpense?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };

    onSave(payload);
  };

  return (
    <ModalShell
      title={initialExpense ? "Edit Expense" : "Add New Expense"}
      subtitle="Log group costs, choose payers, and split mathematically"
      onClose={onClose}
      width={620}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 bg-[var(--c-rustSoft)] border border-[var(--c-rust)] rounded-xl flex items-center gap-2.5 text-[var(--c-rust)] text-xs font-semibold">
            <AlertCircle size={16} className="text-[var(--c-rust)] shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Title & Amount Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--c-inkSoft)]">Expense Title *</label>
            <input
              id="input-expense-title"
              type="text"
              required
              placeholder="e.g. Seafood Dinner, Konark Taxi, Hotel Stay"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="px-3.5 py-2.5 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-xl text-[var(--c-ink)] text-sm font-medium focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--c-inkSoft)]">Total Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--c-inkSoft)] font-bold text-sm">₹</span>
              <input
                id="input-expense-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-3.5 py-2.5 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-xl text-[var(--c-ink)] text-sm font-bold focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* 2. Category Picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-[var(--c-inkSoft)]">Category</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CATEGORY_OPTIONS.map((cat) => {
              const Icon = cat.icon;
              const isSelected = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all text-left cursor-pointer ${
                    isSelected
                      ? "bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] border-[var(--c-teal)] shadow-xs"
                      : "bg-[var(--c-paperDark)] hover:bg-[var(--c-line)] text-[var(--c-inkSoft)] border-[var(--c-line)]"
                  }`}
                >
                  <Icon size={14} className={isSelected ? "text-[var(--c-teal-contrast-text)]" : "text-[var(--c-inkSoft)]"} />
                  <span className="truncate">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Date Picker & Note */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--c-inkSoft)] flex items-center gap-1.5">
              <Calendar size={13} className="text-[var(--c-inkSoft)]" />
              <span>Date</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3.5 py-2 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-xl text-[var(--c-ink)] text-xs font-medium focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--c-inkSoft)] flex items-center gap-1.5">
              <FileText size={13} className="text-[var(--c-inkSoft)]" />
              <span>Notes / Details (Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Ocean view resort, bill #4092"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="px-3.5 py-2 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-xl text-[var(--c-ink)] text-xs font-medium focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none"
            />
          </div>
        </div>

        {/* 4. Who Paid? (Single vs Multi-Payer) */}
        <div className="bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[var(--c-ink)]">Who Paid Upfront?</label>
            <div className="flex items-center bg-[var(--c-line)] p-0.5 rounded-lg text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setIsMultiPayer(false)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  !isMultiPayer ? "bg-[var(--c-card)] text-[var(--c-teal)] shadow-xs font-bold" : "text-[var(--c-inkSoft)] hover:text-[var(--c-ink)]"
                }`}
              >
                Single Payer
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMultiPayer(true);
                  if (numAmount > 0 && !multiPayerVals[singlePayerId]) {
                    setMultiPayerVals({ [singlePayerId]: numAmount.toString() });
                  }
                }}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  isMultiPayer ? "bg-[var(--c-card)] text-[var(--c-teal)] shadow-xs font-bold" : "text-[var(--c-inkSoft)] hover:text-[var(--c-ink)]"
                }`}
              >
                Multiple Payers
              </button>
            </div>
          </div>

          {!isMultiPayer ? (
            /* Single Payer Selection Chips */
            <div className="flex flex-wrap gap-2 pt-1">
              {members.map((m) => {
                const isSelected = singlePayerId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSinglePayerId(m.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] border-[var(--c-teal)] shadow-xs"
                        : "bg-[var(--c-card)] text-[var(--c-inkSoft)] border-[var(--c-line)] hover:border-[var(--c-line)]"
                    }`}
                  >
                    <Avatar name={m.name} color={m.avatarColor} size={20} />
                    <span>{m.name}</span>
                    {m.id === currentUserId && <span className="opacity-70 text-[10px]">(You)</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Multi-Payer Entry Rows */
            <div className="flex flex-col gap-2 pt-1">
              <div className="text-[11px] text-[var(--c-inkSoft)]">Enter the exact amount each member contributed upfront:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {members.map((m) => (
                  <div key={m.id} className="bg-[var(--c-card)] border border-[var(--c-line)] rounded-xl p-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={m.name} color={m.avatarColor} size={22} />
                      <span className="text-xs font-bold text-[var(--c-ink)] truncate">{m.name}</span>
                    </div>
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-inkSoft)] font-bold text-xs">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={multiPayerVals[m.id] || ""}
                        onChange={(e) =>
                          setMultiPayerVals((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                        className="w-full pl-6 pr-2 py-1 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-lg text-xs font-bold text-right text-[var(--c-ink)] focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs font-bold px-1 pt-1">
                <span className="text-[var(--c-inkSoft)]">Total Paid by Members:</span>
                <span className={Math.abs(multiPayerSum - numAmount) < 0.01 ? "text-emerald-700" : "text-[var(--c-rust)]"}>
                  {money(multiPayerSum)} / {money(numAmount)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 5. Split Strategy & Participants */}
        <div className="border border-[var(--c-line)] rounded-2xl p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-[var(--c-ink)]">Split Strategy</label>
              <div className="text-[11px] text-[var(--c-inkSoft)]">How should this expense be divided?</div>
            </div>

            {/* Split Method Tabs */}
            <div className="flex items-center bg-[var(--c-lineSoft)] hover:bg-[var(--c-line)] p-0.5 rounded-xl text-xs font-semibold">
              {[
                { id: "equal", label: "Equal", icon: Split },
                { id: "custom", label: "Exact (₹)", icon: Calculator },
                { id: "percentage", label: "Percent (%)", icon: Percent },
                { id: "shares", label: "Shares", icon: Scale },
              ].map((t) => {
                const isSelected = method === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMethod(t.id as SplitMethod)}
                    className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected ? "bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] font-bold shadow-xs" : "text-[var(--c-inkSoft)] hover:text-[var(--c-ink)]"
                    }`}
                  >
                    <Icon size={12} />
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Select All / Deselect buttons */}
          <div className="flex items-center justify-between pt-1 border-t border-[var(--c-lineSoft)]">
            <span className="text-xs font-bold text-[var(--c-inkSoft)]">
              Participants ({participants.length}/{members.length})
            </span>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={selectAll}
                className="text-[var(--c-teal)] hover:text-teal-950 cursor-pointer"
              >
                Select All
              </button>
              <span className="text-[var(--c-line)]">•</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-[var(--c-inkSoft)] hover:text-[var(--c-ink)] cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Participant Rows */}
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
            {members.map((m) => {
              const isIncluded = participants.includes(m.id);
              const shareAmt = calculatedSplits[m.id] || 0;

              return (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isIncluded
                      ? "bg-[var(--c-card)] border-[var(--c-line)] shadow-xs"
                      : "bg-[var(--c-paperDark)] border-[var(--c-lineSoft)] opacity-60"
                  }`}
                >
                  <label className="flex items-center gap-3 cursor-pointer select-none flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={() => toggleParticipant(m.id)}
                      className="w-4 h-4 text-[var(--c-teal)] rounded-md border-[var(--c-line)] focus:ring-teal-700 cursor-pointer"
                    />
                    <Avatar name={m.name} color={m.avatarColor} size={24} />
                    <div className="truncate">
                      <div className="text-xs font-bold text-[var(--c-ink)]">{m.name}</div>
                      <div className="text-[10px] text-[var(--c-inkSoft)]">{m.role}</div>
                    </div>
                  </label>

                  {/* Input based on Split Method */}
                  {isIncluded && (
                    <div className="flex items-center gap-2">
                      {method === "equal" && (
                        <div className="text-xs font-bold text-[var(--c-teal)] bg-teal-50 px-2.5 py-1 rounded-lg">
                          {money(shareAmt)}
                        </div>
                      )}

                      {method === "custom" && (
                        <div className="relative w-28">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-inkSoft)] font-bold text-xs">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={customVals[m.id] || ""}
                            onChange={(e) =>
                              setCustomVals((prev) => ({ ...prev, [m.id]: e.target.value }))
                            }
                            className="w-full pl-6 pr-2 py-1 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-lg text-xs font-bold text-right text-[var(--c-ink)] focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none"
                          />
                        </div>
                      )}

                      {method === "percentage" && (
                        <div className="flex items-center gap-1.5">
                          <div className="relative w-20">
                            <input
                              type="number"
                              step="0.1"
                              placeholder="0"
                              value={pctVals[m.id] || ""}
                              onChange={(e) =>
                                setPctVals((prev) => ({ ...prev, [m.id]: e.target.value }))
                              }
                              className="w-full pl-2 pr-5 py-1 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-lg text-xs font-bold text-right text-[var(--c-ink)] focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-inkSoft)] font-bold text-xs">%</span>
                          </div>
                          <span className="text-[11px] font-bold text-[var(--c-inkSoft)] w-16 text-right">
                            {money(shareAmt)}
                          </span>
                        </div>
                      )}

                      {method === "shares" && (
                        <div className="flex items-center gap-1.5">
                          <div className="relative w-16">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="1"
                              value={sharesVals[m.id] || "1"}
                              onChange={(e) =>
                                setSharesVals((prev) => ({ ...prev, [m.id]: e.target.value }))
                              }
                              className="w-full px-2 py-1 bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-lg text-xs font-bold text-center text-[var(--c-ink)] focus:bg-[var(--c-input-bg)] focus:border-[var(--c-teal)] focus:outline-none"
                            />
                          </div>
                          <span className="text-[11px] text-[var(--c-inkSoft)]">share(s)</span>
                          <span className="text-[11px] font-bold text-[var(--c-inkSoft)] w-16 text-right">
                            {money(shareAmt)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Allocation Summary & Fix Button */}
          {(method === "custom" || method === "percentage") && (
            <div className="pt-2 border-t border-[var(--c-lineSoft)] flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                <span className="text-[var(--c-inkSoft)]">Allocated:</span>
                <span className={Math.abs(splitDifference) < 0.01 ? "text-emerald-700" : "text-[var(--c-rust)]"}>
                  {money(sumSplits)} / {money(numAmount)}
                </span>
              </div>
              {Math.abs(splitDifference) > 0.01 && (
                <button
                  type="button"
                  onClick={handleAutoBalanceRemainder}
                  className="px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-semibold hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  Fix Remainder ({money(splitDifference)})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[var(--c-line)] text-[var(--c-inkSoft)] text-xs font-bold hover:bg-[var(--c-paperDark)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="btn-save-expense"
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[var(--c-teal)] hover:bg-[var(--c-tealDark)] text-[var(--c-teal-contrast-text)] text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Check size={14} />
            <span>{initialExpense ? "Update Expense" : "Save Expense"}</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
