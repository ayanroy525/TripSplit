import React from "react";
import {
  Compass,
  Plus,
  Calendar,
  MapPin,
  Trash2,
  Check,
  ArrowRight,
  KeyRound,
} from "lucide-react";
import { Trip } from "../../types";
import { C } from "../../utils/constants";
import { Avatar } from "../Atoms";
import { formatDate, money } from "../../utils/calculations";

interface RecentTripsListProps {
  trips: Trip[];
  activeTripId: string;
  onSelectTrip: (tripId: string) => void;
  onRequestDeleteTrip: (trip: Trip) => void;
  onSwitchToCreate: () => void;
  onOpenJoinModal?: () => void;
  onClose: () => void;
}

function calculateSettledPercentage(trip: Trip, totalSpent: number): number {
  if (totalSpent <= 0) return 100;
  const confirmedPayments = trip.payments.filter(
    (p) => p.status === "PAID" || p.status === "confirmed"
  );
  const totalSettledAmount = confirmedPayments.reduce((s, p) => s + p.amount, 0);
  const bal: Record<string, { paid: number; share: number }> = {};
  trip.members.forEach((m) => (bal[m.id] = { paid: 0, share: 0 }));
  trip.expenses
    .filter((e) => !e.deleted)
    .forEach((e) => {
      if (e.payers && Object.keys(e.payers).length > 0) {
        Object.entries(e.payers).forEach(([pid, paidAmt]) => {
          if (bal[pid]) bal[pid].paid += Number(paidAmt) || 0;
        });
      } else if (bal[e.paidBy]) {
        bal[e.paidBy].paid += e.amount;
      }
      Object.entries(e.splits || {}).forEach(([id, amt]) => {
        if (bal[id]) bal[id].share += Number(amt) || 0;
      });
    });

  let totalExpectedDebt = 0;
  Object.values(bal).forEach((b) => {
    const net = b.paid - b.share;
    if (net > 0.01) totalExpectedDebt += net;
  });

  if (totalExpectedDebt <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((totalSettledAmount / totalExpectedDebt) * 100)));
}

export function RecentTripsList({
  trips,
  activeTripId,
  onSelectTrip,
  onRequestDeleteTrip,
  onSwitchToCreate,
  onOpenJoinModal,
  onClose,
}: RecentTripsListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 2px",
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            color: C.inkSoft,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Saved Trips
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onOpenJoinModal && (
            <button
              id="btn-quick-join-trip"
              type="button"
              onClick={() => {
                onClose();
                onOpenJoinModal();
              }}
              style={{
                background: "transparent",
                border: "none",
                color: C.marigoldDark,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              title="Enter an invite code to join another trip"
            >
              <KeyRound size={12} color={C.marigoldDark} /> Join with Code
            </button>
          )}
          <button
            id="btn-quick-create-trip"
            type="button"
            onClick={onSwitchToCreate}
            style={{
              background: "transparent",
              border: "none",
              color: C.teal,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Plus size={13} /> New Trip
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxHeight: 380,
          overflowY: "auto",
        }}
      >
        {trips.length === 0 ? (
          <div
            style={{
              background: C.card,
              border: `1.5px dashed ${C.line}`,
              borderRadius: 14,
              padding: "32px 20px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: C.paperDark,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.inkSoft,
              }}
            >
              <Compass size={24} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>No trips found</div>
              <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4, maxWidth: 360 }}>
                You are not currently part of any travel groups. Join a trip with a friend's invite
                code or create a new trip.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              {onOpenJoinModal && (
                <button
                  id="btn-empty-join-invite"
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenJoinModal();
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.paperDark,
                    color: C.ink,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <KeyRound size={14} color={C.marigoldDark} />
                  Join with Invite Code
                </button>
              )}
              <button
                id="btn-empty-create-trip"
                type="button"
                onClick={onSwitchToCreate}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: C.teal,
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={14} />
                Create New Trip
              </button>
            </div>
          </div>
        ) : (
          trips.map((t) => {
            const isActive = t.id === activeTripId;
            const activeExpenses = t.expenses.filter((e) => !e.deleted);
            const totalSpent = activeExpenses.reduce((sum, e) => sum + e.amount, 0);
            const settledPercentage = calculateSettledPercentage(t, totalSpent);

            return (
              <div
                key={t.id}
                style={{
                  background: C.card,
                  border: `1.5px solid ${isActive ? C.marigoldDark : C.line}`,
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  position: "relative",
                  boxShadow: isActive ? "0 3px 10px rgba(199, 127, 28, 0.12)" : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h4
                        style={{
                          margin: 0,
                          fontFamily: "'Fraunces', serif",
                          fontSize: 16.5,
                          color: C.ink,
                        }}
                      >
                        {t.title}
                      </h4>
                      {isActive && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            background: C.badgeYellowBg,
                            color: C.badgeYellowText,
                            padding: "2px 7px",
                            borderRadius: 6,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <Check size={11} /> Active
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 12,
                        color: C.inkSoft,
                        marginTop: 3,
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={11} color={C.rust} />
                        {t.location}
                      </span>
                      <span>•</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Calendar size={11} color={C.teal} />
                        {formatDate(t.startDate)} - {formatDate(t.endDate)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!isActive ? (
                      <button
                        id={`btn-select-trip-${t.id}`}
                        type="button"
                        onClick={() => {
                          onSelectTrip(t.id);
                          onClose();
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: C.teal,
                          color: "#ffffff",
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 14px",
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Open Trip <ArrowRight size={13} />
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: C.teal,
                          background: C.tealSoft,
                          padding: "5px 10px",
                          borderRadius: 6,
                        }}
                      >
                        Currently Open
                      </span>
                    )}

                    {trips.length > 1 && (
                      <button
                        id={`btn-delete-trip-${t.id}`}
                        type="button"
                        onClick={() => onRequestDeleteTrip(t)}
                        title="Delete trip"
                        style={{
                          background: C.paperDark,
                          border: `1px solid ${C.line}`,
                          borderRadius: 8,
                          padding: "6px 8px",
                          color: C.rust,
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderTop: `1px dashed ${C.line}`,
                    paddingTop: 8,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ display: "flex", marginLeft: 4 }}>
                      {t.members.slice(0, 4).map((m, i) => (
                        <div
                          key={m.id}
                          style={{
                            marginLeft: i === 0 ? 0 : -8,
                            border: "1.5px solid #fff",
                            borderRadius: "50%",
                          }}
                        >
                          <Avatar member={m} size={20} />
                        </div>
                      ))}
                    </div>
                    <span style={{ color: C.inkSoft, fontSize: 11.5 }}>
                      {t.members.length} members
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: C.paperDark,
                        padding: "2px 6px",
                        borderRadius: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 4,
                          background: C.line,
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${settledPercentage}%`,
                            height: "100%",
                            background: settledPercentage === 100 ? C.teal : C.marigoldDark,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.inkSoft }}>
                        {settledPercentage}% settled
                      </span>
                    </div>
                    <span style={{ color: C.inkSoft, fontSize: 11.5 }}>
                      {activeExpenses.length} expenses
                    </span>
                    <span style={{ fontWeight: 800, color: C.ink }}>
                      Total: <span style={{ color: C.teal }}>{money(totalSpent)}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {trips.length > 0 && onOpenJoinModal && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderRadius: 10,
            background: C.paperDark,
            border: `1px dashed ${C.line}`,
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={16} color={C.marigoldDark} />
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>
              Have an invite code for another trip?
            </span>
          </div>
          <button
            id="btn-footer-join-trip"
            type="button"
            onClick={() => {
              onClose();
              onOpenJoinModal();
            }}
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 6,
              padding: "5px 12px",
              color: C.marigoldDark,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Join Trip
          </button>
        </div>
      )}
    </div>
  );
}
