import React from "react";
import { Home, ReceiptText, Plus, Scale, Users } from "lucide-react";
import { NavTab } from "../types";

interface BottomNavigationProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenAddExpense: () => void;
  pendingSettlementsCount?: number;
  expensesCount?: number;
}

export function BottomNavigation({
  activeTab,
  onTabChange,
  onOpenAddExpense,
  pendingSettlementsCount = 0,
  expensesCount = 0,
}: BottomNavigationProps) {
  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--c-card,#1E293B)] border-t border-[var(--c-line,#334155)] shadow-xl pb-[env(safe-area-inset-bottom,6px)] md:hidden select-none"
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-2 relative">
        {/* 1. HOME */}
        <button
          id="nav-tab-home"
          type="button"
          onClick={() => onTabChange("home")}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-full min-h-[44px] cursor-pointer transition-colors ${
            activeTab === "home"
              ? "text-[var(--c-teal,#2DD4BF)] font-bold"
              : "text-[var(--c-inkSoft,#94A3B8)] font-medium hover:text-[var(--c-ink,#F8FAFC)]"
          }`}
        >
          <Home size={18} strokeWidth={activeTab === "home" ? 2.5 : 2} />
          <span className="text-[10px] tracking-tight">Home</span>
        </button>

        {/* 2. EXPENSES */}
        <button
          id="nav-tab-expenses"
          type="button"
          onClick={() => onTabChange("expenses")}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-full min-h-[44px] cursor-pointer transition-colors relative ${
            activeTab === "expenses"
              ? "text-[var(--c-teal,#2DD4BF)] font-bold"
              : "text-[var(--c-inkSoft,#94A3B8)] font-medium hover:text-[var(--c-ink,#F8FAFC)]"
          }`}
        >
          <ReceiptText size={18} strokeWidth={activeTab === "expenses" ? 2.5 : 2} />
          <span className="text-[10px] tracking-tight">Expenses</span>
        </button>

        {/* 3. ADD EXPENSE (Center Prominent) */}
        <div className="flex-1 flex items-center justify-center h-full relative">
          <button
            id="nav-btn-add-expense-center"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAddExpense();
            }}
            aria-label="Add new expense"
            className="w-12 h-12 rounded-full bg-[var(--c-teal,#2DD4BF)] text-[var(--c-teal-contrast-text,#0F172A)] border-4 border-[var(--c-paper,#0F172A)] shadow-lg flex items-center justify-center -translate-y-3 hover:brightness-110 active:scale-95 transition-all cursor-pointer z-10"
            title="Add Expense"
          >
            <Plus size={22} strokeWidth={3} />
          </button>
        </div>

        {/* 4. BALANCES */}
        <button
          id="nav-tab-settlement"
          type="button"
          onClick={() => onTabChange("settlement")}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-full min-h-[44px] cursor-pointer transition-colors relative ${
            activeTab === "settlement"
              ? "text-[var(--c-teal,#2DD4BF)] font-bold"
              : "text-[var(--c-inkSoft,#94A3B8)] font-medium hover:text-[var(--c-ink,#F8FAFC)]"
          }`}
        >
          <Scale size={18} strokeWidth={activeTab === "settlement" ? 2.5 : 2} />
          <span className="text-[10px] tracking-tight">Balance</span>
          {pendingSettlementsCount > 0 && (
            <span className="absolute top-2 right-4 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[var(--c-card,#1E293B)]" />
          )}
        </button>

        {/* 5. PEOPLE */}
        <button
          id="nav-tab-people"
          type="button"
          onClick={() => onTabChange("people")}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-full min-h-[44px] cursor-pointer transition-colors ${
            activeTab === "people"
              ? "text-[var(--c-teal,#2DD4BF)] font-bold"
              : "text-[var(--c-inkSoft,#94A3B8)] font-medium hover:text-[var(--c-ink,#F8FAFC)]"
          }`}
        >
          <Users size={18} strokeWidth={activeTab === "people" ? 2.5 : 2} />
          <span className="text-[10px] tracking-tight">People</span>
        </button>
      </div>
    </nav>
  );
}
