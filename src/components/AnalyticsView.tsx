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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Stat Highlights */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        <div
          style={{
            background: C.card,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 2px 6px rgba(22,35,59,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.inkSoft }}>
            <Wallet size={16} color={C.marigoldDark} />
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
              Total Trip Spent
            </span>
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 22,
              fontWeight: 800,
              color: C.ink,
              marginTop: 6,
            }}
          >
            {money(totalTripSpent)}
          </div>
          <span style={{ fontSize: 12, color: C.inkSoft }}>
            Across {activeExpenses.length} logged expenses
          </span>
        </div>

        <div
          style={{
            background: C.card,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 2px 6px rgba(22,35,59,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.inkSoft }}>
            <DollarSign size={16} color={C.teal} />
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
              Average / Member
            </span>
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 22,
              fontWeight: 800,
              color: C.ink,
              marginTop: 6,
            }}
          >
            {money(avgPerPerson)}
          </div>
          <span style={{ fontSize: 12, color: C.inkSoft }}>
            Divided over {members.length} trip members
          </span>
        </div>

        <div
          style={{
            background: C.card,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 2px 6px rgba(22,35,59,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.inkSoft }}>
            <Award size={16} color={C.marigoldDark} />
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
              Top Payer
            </span>
          </div>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 20,
              fontWeight: 800,
              color: C.ink,
              marginTop: 6,
            }}
          >
            {topPayer.name}
          </div>
          <span style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>
            Paid {money(topPayer.amount)} total
          </span>
        </div>

        <div
          style={{
            background: C.card,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 2px 6px rgba(22,35,59,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.inkSoft }}>
            <TrendingUp size={16} color={C.rust} />
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
              Largest Expense
            </span>
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: C.ink,
              marginTop: 6,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {maxExpense?.title || "None"}
          </div>
          <span
            style={{
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              color: C.rust,
              fontWeight: 700,
            }}
          >
            {maxExpense ? money(maxExpense.amount) : "₹0"}
          </span>
        </div>
      </div>

      {/* Charts Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
        }}
      >
        {/* Category Pie Breakdown */}
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
