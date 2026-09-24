import React, { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  RotateCcw,
  X,
  Check,
  Calendar,
  DollarSign,
  User,
  ArrowUpDown,
  Tag,
  Trash2,
} from "lucide-react";
import { Expense, Member, SplitMethod } from "../types";
import { C, CATEGORIES, CATEGORY_META } from "../utils/constants";
import { Avatar, BottomSheet, Pill, Switch } from "./Atoms";
import { money } from "../utils/calculations";

export type ExpenseSortOption =
  | "date-desc"
  | "date-asc"
  | "amount-desc"
  | "amount-asc"
  | "title-asc"
  | "title-desc";

export interface ExpenseFilters {
  searchQuery: string;
  category: string;
  paidBy: string;
  involvedMember: string;
  splitMethod: string;
  minAmount: string;
  maxAmount: string;
  startDate: string;
  endDate: string;
  showDeleted: boolean;
  sortOption: ExpenseSortOption;
}

export const DEFAULT_FILTERS: ExpenseFilters = {
  searchQuery: "",
  category: "all",
  paidBy: "all",
  involvedMember: "all",
  splitMethod: "all",
  minAmount: "",
  maxAmount: "",
  startDate: "",
  endDate: "",
  showDeleted: false,
  sortOption: "date-desc",
};

interface ExpenseFilterBarProps {
  filters: ExpenseFilters;
  onFilterChange: (newFilters: ExpenseFilters) => void;
  members: Member[];
  allExpenses: Expense[];
  filteredCount: number;
  filteredTotal: number;
  overallTotal: number;
  currentUserId?: string;
  tripStartDate?: string;
  tripEndDate?: string;
}

export function ExpenseFilterBar({
  filters,
  onFilterChange,
  members,
  allExpenses,
  filteredCount,
  filteredTotal,
  overallTotal,
  currentUserId,
  tripStartDate,
  tripEndDate,
}: ExpenseFilterBarProps) {
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  // Helper to update individual filter properties
  const updateFilter = <K extends keyof ExpenseFilters>(key: K, value: ExpenseFilters[K]) => {
    onFilterChange({
      ...filters,
      [key]: value,
    });
  };

  // Reset all filters to default
  const handleReset = () => {
    onFilterChange(DEFAULT_FILTERS);
  };

  // Calculate active filter count (excluding default sort & showDeleted default)
  const activeFilterCount = [
    filters.searchQuery.trim() !== "",
    filters.category !== "all",
    filters.paidBy !== "all",
    filters.involvedMember !== "all",
    filters.splitMethod !== "all",
    filters.minAmount !== "",
    filters.maxAmount !== "",
    filters.startDate !== "",
    filters.endDate !== "",
    filters.showDeleted,
    filters.sortOption !== "date-desc",
  ].filter(Boolean).length;

  const quickCategories = ["all", "Food", "Hotel", "Travel", "Tickets", "Shopping", "Other"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
      {/* Top Search & Filter Trigger Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Search Input */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "0 14px",
            height: 46,
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <Search size={18} color={C.inkSoft} style={{ flexShrink: 0 }} />
          <input
            id="search-expenses-input"
            type="text"
            value={filters.searchQuery}
            onChange={(e) => updateFilter("searchQuery", e.target.value)}
            placeholder="Search expenses..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: C.ink,
              fontFamily: "inherit",
              height: "100%",
            }}
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => updateFilter("searchQuery", "")}
              style={{
                background: C.paperDark,
                border: "none",
                borderRadius: "50%",
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.inkSoft,
                cursor: "pointer",
              }}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter Button */}
        <button
          id="btn-open-expense-filters"
          type="button"
          onClick={() => setIsBottomSheetOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 46,
            padding: "0 18px",
            borderRadius: 14,
            border: `1px solid ${activeFilterCount > 0 ? C.teal : C.line}`,
            background: activeFilterCount > 0 ? C.tealSoft : C.card,
            color: activeFilterCount > 0 ? C.teal : C.ink,
            fontWeight: 700,
            fontSize: 13.5,
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            whiteSpace: "nowrap",
            flexShrink: 0,
            transition: "all .15s ease",
          }}
        >
          <SlidersHorizontal size={17} color="currentColor" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span
              style={{
                background: C.teal,
                color: "#ffffff",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
                width: 20,
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginLeft: 2,
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Category Quick Filter Chips */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}
      >
        {quickCategories.map((cat) => {
          const isSelected = filters.category === cat;
          const meta = cat === "all" ? null : CATEGORY_META[cat];
          const Icon = meta ? meta.icon : Tag;

          return (
            <button
              key={cat}
              type="button"
              onClick={() => updateFilter("category", isSelected && cat !== "all" ? "all" : cat)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                height: 34,
                borderRadius: 999,
                border: `1px solid ${isSelected ? C.teal : C.line}`,
                background: isSelected ? C.teal : C.card,
                color: isSelected ? "#ffffff" : C.ink,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "all .15s ease",
              }}
            >
              <Icon size={13} />
              <span>{cat === "all" ? "All Categories" : cat}</span>
            </button>
          );
        })}
      </div>

      {/* Active Filter Chips & Summary Bar if filters applied */}
      {activeFilterCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 12,
            color: C.inkSoft,
            padding: "2px 4px",
          }}
        >
          <span>
            Showing <b>{filteredCount}</b> of {allExpenses.filter((e) => !e.deleted).length} expenses (
            <b>{money(filteredTotal)}</b>)
          </span>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: "none",
              border: "none",
              color: C.rust,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: 0,
            }}
          >
            <RotateCcw size={12} /> Reset filters
          </button>
        </div>
      )}

      {/* Filters Bottom Sheet / Modal */}
      <BottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
        title="Expense Filters"
        subtitle={`Refine and search through ${allExpenses.length} trip expenses`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 1. Paid By Member */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
              Paid by
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => updateFilter("paidBy", "all")}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: `1px solid ${filters.paidBy === "all" ? C.teal : C.line}`,
                  background: filters.paidBy === "all" ? C.tealSoft : C.card,
                  color: filters.paidBy === "all" ? C.teal : C.ink,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Everyone
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateFilter("paidBy", filters.paidBy === m.id ? "all" : m.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${filters.paidBy === m.id ? C.teal : C.line}`,
                    background: filters.paidBy === m.id ? C.tealSoft : C.card,
                    color: filters.paidBy === m.id ? C.teal : C.ink,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <Avatar member={m} size={20} />
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Category Filter */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => updateFilter("category", e.target.value)}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 12,
                border: `1px solid ${C.line}`,
                background: C.card,
                color: C.ink,
                padding: "0 12px",
                fontSize: 14,
                fontWeight: 600,
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Date Range */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
              Date Range
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <span style={{ fontSize: 11, color: C.inkSoft, display: "block", marginBottom: 3 }}>From</span>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => updateFilter("startDate", e.target.value)}
                  style={{
                    width: "100%",
                    height: 42,
                    borderRadius: 10,
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    color: C.ink,
                    padding: "0 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div>
                <span style={{ fontSize: 11, color: C.inkSoft, display: "block", marginBottom: 3 }}>To</span>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => updateFilter("endDate", e.target.value)}
                  style={{
                    width: "100%",
                    height: 42,
                    borderRadius: 10,
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    color: C.ink,
                    padding: "0 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>
          </div>

          {/* 4. Amount Range */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
              Amount (₹)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input
                type="number"
                value={filters.minAmount}
                onChange={(e) => updateFilter("minAmount", e.target.value)}
                placeholder="Min amount"
                style={{
                  height: 42,
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  background: C.card,
                  color: C.ink,
                  padding: "0 12px",
                  fontSize: 13.5,
                  fontFamily: "inherit",
                }}
              />
              <input
                type="number"
                value={filters.maxAmount}
                onChange={(e) => updateFilter("maxAmount", e.target.value)}
                placeholder="Max amount"
                style={{
                  height: 42,
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  background: C.card,
                  color: C.ink,
                  padding: "0 12px",
                  fontSize: 13.5,
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          {/* 5. Sort By */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
              Sort by
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { id: "date-desc", label: "Newest First" },
                { id: "date-asc", label: "Oldest First" },
                { id: "amount-desc", label: "Highest Amount" },
                { id: "amount-asc", label: "Lowest Amount" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateFilter("sortOption", opt.id as ExpenseSortOption)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${filters.sortOption === opt.id ? C.teal : C.line}`,
                    background: filters.sortOption === opt.id ? C.tealSoft : C.card,
                    color: filters.sortOption === opt.id ? C.teal : C.ink,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 6. Quick Toggles (My Expenses & Deleted) */}
          <div
            style={{
              background: C.paperDark,
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {currentUserId && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>My Expenses Only</div>
                  <div style={{ fontSize: 11.5, color: C.inkSoft }}>Only expenses paid by or involving you</div>
                </div>
                <Switch
                  checked={filters.involvedMember === currentUserId}
                  onChange={(val) => updateFilter("involvedMember", val ? currentUserId : "all")}
                />
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Show Deleted Expenses</div>
                <div style={{ fontSize: 11.5, color: C.inkSoft }}>View trash bin and restore if needed</div>
              </div>
              <Switch
                checked={filters.showDeleted}
                onChange={(val) => updateFilter("showDeleted", val)}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, paddingTop: 6 }}>
            <button
              type="button"
              onClick={handleReset}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 12,
                border: `1px solid ${C.line}`,
                background: C.card,
                color: C.ink,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Reset All
            </button>
            <button
              type="button"
              onClick={() => setIsBottomSheetOpen(false)}
              style={{
                flex: 2,
                height: 48,
                borderRadius: 12,
                border: "none",
                background: C.teal,
                color: "#ffffff",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(15, 107, 101, 0.3)",
              }}
            >
              Apply Filters ({filteredCount})
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
