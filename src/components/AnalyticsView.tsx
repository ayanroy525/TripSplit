import React, { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { TrendingUp, PieChart as PieIcon, Award, DollarSign, Wallet } from "lucide-react";
import { Expense, Member, Payment } from "../types";
import { C, CATEGORY_META } from "../utils/constants";
import { money, round2 } from "../utils/calculations";
import { Avatar } from "./Atoms";

interface AnalyticsViewProps {
  expenses: Expense[];
  members: Member[];
  payments: Payment[];
  paidShare: Record<string, { paid: number; share: number }>;
}

export function AnalyticsView({
  expenses,
  members,
  payments,
  paidShare,
}: AnalyticsViewProps) {
  const activeExpenses = expenses.filter((e) => !e.deleted);
  const totalTripSpent = useMemo(
    () => activeExpenses.reduce((sum, e) => sum + e.amount, 0),
    [activeExpenses]
  );

  // Category Aggregations
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    activeExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });

    return Object.entries(map)
      .map(([name, value]) => ({
        name,
        value: round2(value),
        color: CATEGORY_META[name]?.color || C.inkSoft,
        pct: totalTripSpent > 0 ? round2((value / totalTripSpent) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [activeExpenses, totalTripSpent]);

  // Member comparison Data (Paid vs Share)
  const memberComparisonData = useMemo(() => {
    return members.map((m) => {
      const data = paidShare[m.id] || { paid: 0, share: 0 };
      return {
        name: m.name,
        Paid: round2(data.paid),
        Share: round2(data.share),
        net: round2(data.paid - data.share),
      };
    });
  }, [members, paidShare]);

  // Top Payer & Highest Expense
  const topPayer = useMemo(() => {
    let best = { name: "N/A", amount: 0 };
    members.forEach((m) => {
      const paid = paidShare[m.id]?.paid || 0;
      if (paid > best.amount) {
        best = { name: m.name, amount: paid };
      }
    });
    return best;
  }, [members, paidShare]);

  const maxExpense = useMemo(() => {
    if (!activeExpenses.length) return null;
    return activeExpenses.reduce(
      (max, e) => (e.amount > max.amount ? e : max),
      activeExpenses[0]
    );
  }, [activeExpenses]);

  const avgPerPerson = members.length > 0 ? totalTripSpent / members.length : 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Top Stat Highlights (2x2 on mobile, 4 columns on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div
          className="p-3.5 sm:p-4 rounded-2xl min-w-0"
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            boxShadow: "0 2px 6px rgba(22,35,59,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft }}>
            <Wallet size={14} color={C.marigoldDark} className="shrink-0" />
            <span className="text-[10px] sm:text-xs font-extrabold uppercase truncate">
              Total Spent
            </span>
          </div>
          <div
            className="font-mono-tabular text-lg sm:text-[22px] font-extrabold truncate mt-1.5"
            style={{ color: C.ink }}
          >
            {money(totalTripSpent)}
          </div>
          <span className="text-[11px] block truncate mt-0.5" style={{ color: C.inkSoft }}>
            {activeExpenses.length} logged expenses
          </span>
        </div>

        <div
          className="p-3.5 sm:p-4 rounded-2xl min-w-0"
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            boxShadow: "0 2px 6px rgba(22,35,59,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft }}>
            <DollarSign size={14} color={C.teal} className="shrink-0" />
            <span className="text-[10px] sm:text-xs font-extrabold uppercase truncate">
              Avg / Member
            </span>
          </div>
          <div
            className="font-mono-tabular text-lg sm:text-[22px] font-extrabold truncate mt-1.5"
            style={{ color: C.ink }}
          >
            {money(avgPerPerson)}
          </div>
          <span className="text-[11px] block truncate mt-0.5" style={{ color: C.inkSoft }}>
            Across {members.length} members
          </span>
        </div>

        <div
          className="p-3.5 sm:p-4 rounded-2xl min-w-0"
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            boxShadow: "0 2px 6px rgba(22,35,59,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft }}>
            <Award size={14} color={C.marigoldDark} className="shrink-0" />
            <span className="text-[10px] sm:text-xs font-extrabold uppercase truncate">
              Top Payer
            </span>
          </div>
          <div
            className="text-base sm:text-xl font-extrabold truncate mt-1.5"
            style={{
              fontFamily: "'Fraunces', serif",
              color: C.ink,
            }}
          >
            {topPayer.name}
          </div>
          <span className="text-[11px] font-bold block truncate mt-0.5" style={{ color: C.teal }}>
            Paid {money(topPayer.amount)}
          </span>
        </div>

        <div
          className="p-3.5 sm:p-4 rounded-2xl min-w-0"
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            boxShadow: "0 2px 6px rgba(22,35,59,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft }}>
            <TrendingUp size={14} color={C.rust} className="shrink-0" />
            <span className="text-[10px] sm:text-xs font-extrabold uppercase truncate">
              Top Expense
            </span>
          </div>
          <div
            className="text-xs sm:text-sm font-extrabold truncate mt-1.5"
            style={{ color: C.ink }}
          >
            {maxExpense?.title || "None"}
          </div>
          <span
            className="font-mono-tabular text-[11px] font-bold block truncate mt-0.5"
            style={{ color: C.rust }}
          >
            {maxExpense ? money(maxExpense.amount) : "₹0"}
          </span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Pie Breakdown */}
        <div
          className="p-4 sm:p-5 rounded-2xl min-w-0"
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
          }}
        >
          <h3
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 18,
              color: C.ink,
              margin: "0 0 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <PieIcon size={18} color={C.teal} />
            Spending by Category
          </h3>

          {categoryData.length > 0 ? (
            <div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [money(Number(val)), "Amount"]}
                      contentStyle={{
                        background: C.paperDark,
                        borderColor: C.line,
                        color: C.ink,
                        borderRadius: 8,
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: 12.5,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                      }}
                      itemStyle={{ color: C.ink }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legends Table */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {categoryData.map((c) => (
                  <div
                    key={c.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12,
                      padding: "4px 8px",
                      background: C.paperDark,
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: c.color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 700, color: C.ink }}>{c.name}</span>
                    </div>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: C.inkSoft,
                        fontWeight: 600,
                      }}
                    >
                      {c.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: C.inkSoft }}>
              No expenses to display.
            </div>
          )}
        </div>

        {/* Member Spending vs Consumption Bar Chart */}
        <div
          style={{
            background: C.card,
            border: `1.5px solid ${C.line}`,
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 18,
              color: C.ink,
              margin: "0 0 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Wallet size={18} color={C.marigoldDark} />
            Member Paid vs Actual Share
          </h3>

          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: C.ink, fontSize: 12, fontFamily: "'Manrope', sans-serif" }}
                />
                <YAxis
                  tick={{ fill: C.inkSoft, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                />
                <Tooltip
                  formatter={(val: any) => [money(Number(val)), ""]}
                  contentStyle={{
                    background: C.paperDark,
                    borderColor: C.line,
                    color: C.ink,
                    borderRadius: 8,
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: 12.5,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                  }}
                  itemStyle={{ color: C.ink }}
                />
                <Legend
                  wrapperStyle={{
                    paddingTop: 10,
                    fontSize: 12,
                    fontFamily: "'Manrope', sans-serif",
                  }}
                />
                <Bar dataKey="Paid" fill={C.teal} radius={[4, 4, 0, 0]} name="Paid Upfront" />
                <Bar dataKey="Share" fill={C.marigoldDark} radius={[4, 4, 0, 0]} name="Consumed Share" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
