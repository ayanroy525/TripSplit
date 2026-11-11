import React from "react";
import {
  Sparkles,
  Receipt,
  Plus,
  ArrowRight,
  TrendingUp,
  Scale,
  UserPlus,
  PieChart,
  MapPin,
  Calendar,
  ChevronRight,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
} from "lucide-react";
import { Trip, Member, Expense, Debt } from "../types";
import { C, CATEGORY_META, getCategoryMeta } from "../utils/constants";
import { money, formatDate } from "../utils/calculations";
import { Avatar } from "./Atoms";

interface HomeDashboardViewProps {
  trip: Trip;
  currentUser: Member;
  currentUserId: string;
  totalTripSpent: number;
  userStats: {
    paid: number;
    share: number;
    net: number;
  };
  simplifiedDebts: Debt[];
  onOpenAddExpense: () => void;
  onOpenSettleModal: () => void;
  onOpenInviteModal: () => void;
  onNavigateToExpenses: () => void;
  onNavigateToSettlement: () => void;
  onNavigateToAnalytics: () => void;
  onNavigateToActivity: () => void;
  onOpenTripsHub: () => void;
}

export function HomeDashboardView({
  trip,
  currentUser,
  currentUserId,
  totalTripSpent,
  userStats,
  simplifiedDebts,
  onOpenAddExpense,
  onOpenSettleModal,
  onOpenInviteModal,
  onNavigateToExpenses,
  onNavigateToSettlement,
  onNavigateToAnalytics,
  onNavigateToActivity,
  onOpenTripsHub,
}: HomeDashboardViewProps) {
  // Time of day greeting
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Recent 4 active non-deleted expenses
  const recentExpenses = trip.expenses
    .filter((e) => !e.deleted)
    .slice(0, 4);

  // Debts involving user
  const userOwes = simplifiedDebts.filter((d) => d.from === currentUserId);
  const userReceives = simplifiedDebts.filter((d) => d.to === currentUserId);

  return (
    <div className="flex flex-col gap-3.5 sm:gap-4.5">
      {/* 1. Header Greeting & Active Trip Bar */}
      <div className="flex flex-col gap-2 sm:gap-2.5 pt-0.5 sm:pt-1 pb-1 sm:pb-2">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 700, letterSpacing: "0.02em" }}>
              {greeting},
            </div>
            <h1
              style={{
                fontFamily: "'Fraunces', 'Playfair Display', serif",
                fontSize: 24,
                fontWeight: 800,
                color: C.ink,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {currentUser.name}
            </h1>
          </div>

          <button
            type="button"
            onClick={onOpenTripsHub}
            className="transition-all hover:opacity-90"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: C.card,
              backdropFilter: "blur(12px)",
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              color: C.teal,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <span>Switch Trip</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Active Trip Info Chip */}
        <div
          onClick={onOpenTripsHub}
          className="py-2.5 px-3.5 sm:py-3 sm:px-4 transition-all hover:opacity-95"
          style={{
            background: C.card,
            backdropFilter: "blur(16px)",
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            boxShadow: "0 4px 16px -4px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: C.tealSoft,
                color: C.teal,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MapPin size={18} />
            </div>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {trip.title}
              </div>
              <div style={{ fontSize: 11.5, color: C.inkSoft }}>
                {trip.location} • {trip.members.length} members
              </div>
            </div>
          </div>

          {/* Member Avatars Stack */}
          <div style={{ display: "flex", alignItems: "center" }}>
            {trip.members.slice(0, 3).map((m, i) => (
              <div key={m.id} style={{ marginLeft: i > 0 ? -8 : 0 }}>
                <Avatar member={m} size={24} />
              </div>
            ))}
            {trip.members.length > 3 && (
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: C.inkSoft,
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: -8,
                  border: `2px solid var(--c-paper, #F4F7FB)`,
                }}
              >
                +{trip.members.length - 3}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. HERO FINANCE CARD (3-Second Rule) */}
      <div
        className="p-4 sm:p-6"
        style={{
          background: "var(--c-hero-surface, linear-gradient(140deg, #072227 0%, #0C4341 52%, #082B31 100%))",
          border: "1px solid var(--c-hero-border, rgba(45, 212, 191, 0.32))",
          borderRadius: 22,
          boxShadow: "0 20px 44px -12px rgba(6, 28, 33, 0.32)",
          color: "#F8FAFC",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Top: Total Spent & Paid Overview */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="min-w-0">
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#94A3B8", letterSpacing: "0.05em" }}>
              Total Spent
            </div>
            <div
              className="font-mono-tabular text-[22px] sm:text-[26px] truncate"
              style={{
                fontWeight: 800,
                color: "#F8FAFC",
                marginTop: 4,
                letterSpacing: "-0.03em",
              }}
            >
              {money(totalTripSpent)}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
              {trip.expenses.filter((e) => !e.deleted).length} trip expenses
            </div>
          </div>

          <div className="min-w-0 pl-3 sm:pl-4" style={{ borderLeft: "1px solid rgba(148, 163, 184, 0.22)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#94A3B8", letterSpacing: "0.05em" }}>
              You Paid
            </div>
            <div
              className="font-mono-tabular text-[22px] sm:text-[26px] truncate"
              style={{
                fontWeight: 800,
                color: "#2DD4BF",
                marginTop: 4,
                letterSpacing: "-0.03em",
              }}
            >
              {money(userStats.paid)}
            </div>
            <div className="truncate" style={{ fontSize: 11, color: "#CBD5E1", marginTop: 2 }}>
              Your share: <b className="font-mono-tabular" style={{ color: "#F8FAFC" }}>{money(userStats.share)}</b>
            </div>
          </div>
        </div>

        {/* Hero Net Balance Banner */}
        <div
          style={{
            background:
              userStats.net > 0.01
                ? "rgba(74, 222, 128, 0.14)"
                : userStats.net < -0.01
                ? "rgba(248, 113, 113, 0.14)"
                : "rgba(255, 255, 255, 0.07)",
            border: `1px solid ${
              userStats.net > 0.01
                ? "rgba(74, 222, 128, 0.45)"
                : userStats.net < -0.01
                ? "rgba(248, 113, 113, 0.45)"
                : "rgba(255, 255, 255, 0.14)"
            }`,
            borderRadius: 16,
            padding: "15px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color:
                  userStats.net > 0.01
                    ? "#4ADE80"
                    : userStats.net < -0.01
                    ? "#F87171"
                    : simplifiedDebts.length > 0
                    ? "#FBBF24"
                    : "#94A3B8",
              }}
            >
              {userStats.net > 0.01
                ? "You receive"
                : userStats.net < -0.01
                ? "You owe"
                : simplifiedDebts.length > 0
                ? "Pending Group Settlements"
                : "All Settled Up"}
            </div>
            <div
              className="font-mono-tabular"
              style={{
                fontSize: 23,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color:
                  userStats.net > 0.01
                    ? "#4ADE80"
                    : userStats.net < -0.01
                    ? "#F87171"
                    : "#F8FAFC",
                marginTop: 2,
              }}
            >
              {userStats.net > 0.01
                ? `+${money(userStats.net)}`
                : userStats.net < -0.01
                ? `-${money(Math.abs(userStats.net))}`
                : "₹0.00"}
            </div>
            {Math.abs(userStats.net) <= 0.01 && simplifiedDebts.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#CBD5E1", marginTop: 2 }}>
                {simplifiedDebts.length} pending settlement(s) in group
              </div>
            )}
          </div>

          {Math.abs(userStats.net) > 0.01 || simplifiedDebts.length > 0 ? (
            <button
              id="btn-home-settle-up-cta"
              type="button"
              onClick={onOpenSettleModal}
              className="hover:brightness-105 active:scale-95 transition-all"
              style={{
                background: "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: 12,
                padding: "11px 18px",
                fontSize: 13.5,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 6px 18px -4px rgba(20, 184, 166, 0.5)",
                whiteSpace: "nowrap",
              }}
            >
              <Sparkles size={15} />
              <span>Settle up</span>
            </button>
          ) : (
            <button
              id="btn-home-settle-up-cta"
              type="button"
              disabled
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "#CBD5E1",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                borderRadius: 12,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "none",
                opacity: 0.85,
                whiteSpace: "nowrap",
              }}
              title="All settled up! No balance to settle."
            >
              <CheckCircle2 size={15} color="#4ADE80" />
              <span>Settled</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Quick Action Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <button
          type="button"
          onClick={onNavigateToActivity}
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "12px 6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: C.tealSoft,
              color: C.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Clock size={18} strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>History</span>
        </button>

        <button
          type="button"
          onClick={onNavigateToSettlement}
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "12px 6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: C.tealSoft,
              color: C.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Scale size={18} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>Balances</span>
        </button>

        <button
          type="button"
          onClick={onOpenInviteModal}
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "12px 6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: C.tealSoft,
              color: C.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserPlus size={18} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>Invite</span>
        </button>

        <button
          type="button"
          onClick={onNavigateToAnalytics}
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "12px 6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: C.tealSoft,
              color: C.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PieChart size={18} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>Insights</span>
        </button>
      </div>

      {/* 4. Recent Expenses Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: C.ink, margin: 0 }}>
            Recent Expenses
          </h2>
          <button
            type="button"
            onClick={onNavigateToExpenses}
            style={{
              background: "none",
              border: "none",
              color: C.teal,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>See all ({trip.expenses.filter((e) => !e.deleted).length})</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {recentExpenses.length === 0 ? (
          <div
            style={{
              background: C.card,
              border: `1px dashed ${C.line}`,
              borderRadius: 16,
              padding: "28px 20px",
              textAlign: "center",
            }}
          >
            <Receipt size={32} color={C.inkSoft} style={{ margin: "0 auto 8px" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>No expenses added yet</div>
            <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2, marginBottom: 12 }}>
              Tap below to record the first group expense
            </div>
            <button
              type="button"
              onClick={onOpenAddExpense}
              style={{
                background: C.teal,
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + Add Expense
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentExpenses.map((exp) => {
              const payer = trip.members.find(
                (m) =>
                  m.id === exp.paidBy ||
                  (m.userId && m.userId === exp.paidBy) ||
                  (m.name && exp.paidBy && m.name.trim().toLowerCase() === exp.paidBy.trim().toLowerCase())
              );
              const isPaidByMe =
                exp.paidBy === currentUserId ||
                exp.paidBy === currentUser.id ||
                (currentUser.userId && exp.paidBy === currentUser.userId) ||
                (payer && (
                  payer.id === currentUser.id ||
                  (currentUser.userId && payer.userId === currentUser.userId) ||
                  (payer.name && currentUser.name && payer.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
                ));
              const myShare =
                exp.splits[currentUser.id] ||
                (currentUser.userId ? exp.splits[currentUser.userId] : 0) ||
                exp.splits[currentUserId] ||
                0;

              const meta = getCategoryMeta(exp.category, exp.title);
              const CatIcon = meta.icon;

              return (
                <div
                  key={exp.id}
                  onClick={onNavigateToExpenses}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.line}`,
                    borderRadius: 16,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
                    transition: "border-color .15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        background: meta.bg || `${meta.color}18`,
                        color: meta.text || meta.color,
                        border: `1px solid ${meta.color}35`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                      title={meta.resolvedCategory}
                    >
                      <CatIcon size={17} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: C.ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {exp.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: C.inkSoft,
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <span style={{ color: C.teal, fontWeight: 700 }}>{meta.resolvedCategory}</span>
                        {" • "}
                        {isPaidByMe ? "Paid by You" : `Paid by ${payer?.name || "Member"}`} • {formatDate(exp.date)}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="font-mono-tabular" style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>
                      {money(exp.amount)}
                    </div>
                    <div
                      className="font-mono-tabular"
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: myShare > 0 ? C.rust : C.inkSoft,
                      }}
                    >
                      {myShare > 0 ? `Share: ${money(myShare)}` : "Not split"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Best Way to Settle (Smart Settlement Preview) */}
      {simplifiedDebts.length > 0 && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: C.ink, margin: 0 }}>
                Smart Settlement Plan
              </h2>
              <div style={{ fontSize: 11.5, color: C.inkSoft }}>
                {simplifiedDebts.length} optimal transaction(s) to clear all debts
              </div>
            </div>
            <button
              type="button"
              onClick={onNavigateToSettlement}
              style={{
                background: "none",
                border: "none",
                color: C.teal,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Details →
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {simplifiedDebts.slice(0, 3).map((debt, idx) => {
              const debtor = trip.members.find(
                (m) =>
                  m.id === debt.from ||
                  (m.userId && m.userId === debt.from) ||
                  (m.name && m.name.trim().toLowerCase() === debt.from.trim().toLowerCase())
              );
              const creditor = trip.members.find(
                (m) =>
                  m.id === debt.to ||
                  (m.userId && m.userId === debt.to) ||
                  (m.name && m.name.trim().toLowerCase() === debt.to.trim().toLowerCase())
              );
              const isUserDebtor =
                debt.from === currentUserId ||
                debt.from === currentUser.id ||
                (currentUser.userId && debt.from === currentUser.userId) ||
                (debtor && (debtor.id === currentUser.id || (currentUser.userId && debtor.userId === currentUser.userId) || (debtor.name && currentUser.name && debtor.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())));
              const isUserCreditor =
                debt.to === currentUserId ||
                debt.to === currentUser.id ||
                (currentUser.userId && debt.to === currentUser.userId) ||
                (creditor && (creditor.id === currentUser.id || (currentUser.userId && creditor.userId === currentUser.userId) || (creditor.name && currentUser.name && creditor.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())));

              return (
                <div
                  key={idx}
                  style={{
                    background:
                      isUserCreditor
                        ? C.positiveSoft
                        : isUserDebtor
                        ? C.rustSoft
                        : C.paper,
                    border: `1px solid ${
                      isUserCreditor
                        ? C.positive
                        : isUserDebtor
                        ? C.rust
                        : C.line
                    }`,
                    borderRadius: 12,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                      <Avatar member={debtor} name={debtor?.name || debt.from} size={24} />
                      <div style={{ marginLeft: -6 }}>
                        <Avatar member={creditor} name={creditor?.name || debt.to} size={24} />
                      </div>
                    </div>
                    <div
                      style={{
                        minWidth: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontWeight: 700,
                        color: C.ink,
                      }}
                    >
                      <span>{isUserDebtor ? "You" : debtor?.name || debt.from}</span>
                      <span style={{ color: C.inkSoft, margin: "0 5px" }}>→</span>
                      <span>{isUserCreditor ? "You" : creditor?.name || debt.to}</span>
                    </div>
                  </div>

                  <span
                    className="font-mono-tabular"
                    style={{
                      fontSize: 13.5,
                      fontWeight: 800,
                      color: isUserCreditor ? C.positive : isUserDebtor ? C.rust : C.ink,
                      flexShrink: 0,
                    }}
                  >
                    {money(debt.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
