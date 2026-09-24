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
import { C, CATEGORY_META } from "../utils/constants";
import { money, formatDate } from "../utils/calculations";
import { Avatar, CategoryBadge } from "./Atoms";

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
      <div className="flex flex-col gap-1.5 sm:gap-2 pt-0.5 sm:pt-1 pb-1 sm:pb-2">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>
              {greeting},
            </div>
            <h1
              style={{
                fontSize: 22,
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
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              color: C.teal,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <span>Switch Trip</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Active Trip Info Chip */}
        <div
          onClick={onOpenTripsHub}
          className="py-2 px-3 sm:py-2.5 sm:px-3.5"
          style={{
            background: C.paperDark,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
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
                  border: `2px solid var(--c-paper, #F8F9FA)`,
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
        style={{
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 18,
          padding: "20px 22px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Top: Total Spent & Paid Overview */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: C.inkSoft, letterSpacing: "0.02em" }}>
              Total Spent
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: C.ink,
                marginTop: 2,
                letterSpacing: "-0.02em",
              }}
            >
              {money(totalTripSpent)}
            </div>
            <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 1 }}>
              {trip.expenses.filter((e) => !e.deleted).length} trip expenses
            </div>
          </div>

          <div style={{ borderLeft: `1px solid ${C.line}`, paddingLeft: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: C.inkSoft, letterSpacing: "0.02em" }}>
              You Paid
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: C.teal,
                marginTop: 2,
                letterSpacing: "-0.02em",
              }}
            >
              {money(userStats.paid)}
            </div>
            <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 1 }}>
              Your share: <b>{money(userStats.share)}</b>
            </div>
          </div>
        </div>

        {/* Hero Net Balance Banner */}
        <div
          style={{
            background:
              userStats.net > 0.01
                ? C.positiveSoft
                : userStats.net < -0.01
                ? C.rustSoft
                : C.paperDark,
            border: `1.5px solid ${
              userStats.net > 0.01
                ? C.positive
                : userStats.net < -0.01
                ? C.rust
                : C.line
            }`,
            borderRadius: 14,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                color:
                  userStats.net > 0.01
                    ? C.positive
                    : userStats.net < -0.01
                    ? C.rust
                    : simplifiedDebts.length > 0
                    ? C.marigold
                    : C.inkSoft,
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
              style={{
                fontSize: 22,
                fontWeight: 800,
                color:
                  userStats.net > 0.01
                    ? C.positive
                    : userStats.net < -0.01
                    ? C.rust
                    : C.ink,
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
              <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 2 }}>
                {simplifiedDebts.length} pending settlement(s) in group
              </div>
            )}
          </div>

          {Math.abs(userStats.net) > 0.01 || simplifiedDebts.length > 0 ? (
            <button
              id="btn-home-settle-up-cta"
              type="button"
              onClick={onOpenSettleModal}
              style={{
                background: C.teal,
                color: "#ffffff",
                border: "none",
                borderRadius: 12,
                padding: "10px 18px",
                fontSize: 13.5,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(15, 107, 101, 0.3)",
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
                background: C.paperDark,
                color: C.inkSoft,
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "none",
                opacity: 0.65,
                whiteSpace: "nowrap",
              }}
              title="All settled up! No balance to settle."
            >
              <CheckCircle2 size={15} color={C.positive} />
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

              return (
                <div
                  key={exp.id}
                  onClick={onNavigateToExpenses}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.line}`,
                    borderRadius: 14,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
                    transition: "border-color .15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <CategoryBadge category={exp.category} title={exp.title} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14.5,
                          fontWeight: 800,
                          color: C.ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {exp.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 2 }}>
                        {isPaidByMe ? "Paid by You" : `Paid by ${payer?.name || "Member"}`} • {formatDate(exp.date)}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>
                      {money(exp.amount)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: myShare > 0 ? C.rust : C.inkSoft,
                      }}
                    >
                      {myShare > 0 ? `Your share: ${money(myShare)}` : "Not split"}
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
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <Avatar member={debtor} name={debtor?.name || debt.from} size={24} />
                    <span style={{ fontWeight: 700, color: C.ink }}>
                      {debtor?.name || debt.from} {isUserDebtor && "(You)"}
                    </span>
                    <span style={{ color: C.inkSoft }}>→</span>
                    <Avatar member={creditor} name={creditor?.name || debt.to} size={24} />
                    <span style={{ fontWeight: 700, color: C.ink }}>
                      {creditor?.name || debt.to} {isUserCreditor && "(You)"}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: isUserCreditor ? C.positive : isUserDebtor ? C.rust : C.ink,
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
