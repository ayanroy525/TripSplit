import React, { useState } from "react";
import {
  Compass,
  Plus,
  Calendar,
  MapPin,
  Users,
  Receipt,
  Trash2,
  Check,
  ArrowRight,
  Phone,
  CreditCard,
  AlertCircle,
  Sparkles,
  KeyRound,
} from "lucide-react";
import { Trip, Member } from "../types";
import { C, PRESET_AVATAR_PALETTE } from "../utils/constants";
import { Avatar, ModalShell } from "./Atoms";
import { formatDate, money, uid, equalSplit } from "../utils/calculations";
import { isValidWhatsAppPhone } from "../utils/whatsappNotifications";
import { useAuth } from "../context/AuthContext";

interface TripsHubModalProps {
  trips: Trip[];
  activeTripId: string;
  onSelectTrip: (tripId: string) => void;
  onCreateTrip: (newTrip: Trip) => void;
  onDeleteTrip: (tripId: string) => void;
  onOpenJoinModal?: () => void;
  onClose: () => void;
}

export function TripsHubModal({
  trips,
  activeTripId,
  onSelectTrip,
  onCreateTrip,
  onDeleteTrip,
  onOpenJoinModal,
  onClose,
}: TripsHubModalProps) {
  const { currentUser: authUser } = useAuth();
  const [view, setView] = useState<"recent" | "create">(trips.length === 0 ? "create" : "recent");

  // Create Trip Form State
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0];
  });
  const [currency, setCurrency] = useState("INR");

  // Creator profile initialized from authUser
  const [creatorName, setCreatorName] = useState(authUser?.name || "");
  const [creatorPhone, setCreatorPhone] = useState(authUser?.phone || "");

  // Additional Members list
  const [additionalMembers, setAdditionalMembers] = useState<
    Array<{ name: string; phone: string }>
  >([]);

  const [formError, setFormError] = useState("");

  const handleAddMemberRow = () => {
    setAdditionalMembers((prev) => [...prev, { name: "", phone: "" }]);
  };

  const handleRemoveMemberRow = (idx: number) => {
    setAdditionalMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMemberChange = (
    idx: number,
    field: "name" | "phone",
    value: string
  ) => {
    setAdditionalMembers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!title.trim()) {
      setFormError("Trip title is required (e.g., 'Goa Getaway 2026').");
      return;
    }
    if (!location.trim()) {
      setFormError("Location is required.");
      return;
    }
    if (!creatorName.trim()) {
      setFormError("Your name is required.");
      return;
    }
    if (!creatorPhone.trim()) {
      setFormError("Your WhatsApp number is required for trip notifications.");
      return;
    }
    if (!isValidWhatsAppPhone(creatorPhone)) {
      setFormError("Please enter a valid WhatsApp number (at least 10 digits).");
      return;
    }

    // Validate additional members if filled
    for (let i = 0; i < additionalMembers.length; i++) {
      const m = additionalMembers[i];
      if (m.name.trim() && !m.phone.trim()) {
        setFormError(`WhatsApp number is mandatory for member "${m.name}".`);
        return;
      }
      if (m.name.trim() && !isValidWhatsAppPhone(m.phone)) {
        setFormError(
          `Please provide a valid 10-digit WhatsApp number for "${m.name}".`
        );
        return;
      }
    }

    const creatorId = authUser?.id || uid("m");
    const membersList: Member[] = [
       {
         id: creatorId,
         userId: creatorId,
         name: creatorName.trim(),
         role: "owner",
         avatarColor: authUser?.avatarColor || PRESET_AVATAR_PALETTE[0],
         phone: creatorPhone.trim(),
         joinedAt: new Date().toISOString(),
         status: "active",
       },
     ];

    additionalMembers
      .filter((m) => m.name.trim())
      .forEach((m, idx) => {
        const mId = uid("m");
        membersList.push({
          id: mId,
          userId: mId,
          name: m.name.trim(),
          role: "member",
          avatarColor: PRESET_AVATAR_PALETTE[(idx + 1) % PRESET_AVATAR_PALETTE.length],
          phone: m.phone.trim(),
          joinedAt: new Date().toISOString(),
          status: "active",
        });
      });

    const newTripId = `trip_${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
    const newTrip: Trip = {
      id: newTripId,
      title: title.trim(),
      location: location.trim(),
      destination: location.trim(),
      startDate,
      endDate,
      currency,
      status: "ACTIVE",
      ownerId: creatorId,
      ownerName: creatorName.trim(),
      memberUserIds: [creatorId, ...membersList.map((m) => m.userId || m.id)],
      inviteCode: `TRIP-${newTripId.slice(-6).toUpperCase()}`,
      members: membersList,
      expenses: [],
      payments: [],
      activities: [
        {
          id: uid("act"),
          ts: "Just now",
          user: creatorName.trim(),
          action: "created the trip",
          detail: `${title.trim()} (${location.trim()})`,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    onCreateTrip(newTrip);
    onClose();
  };

  return (
    <ModalShell
      title="Trips Dashboard"
      subtitle="Switch between recent trips or organize a brand new journey"
      onClose={onClose}
      width={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* View Switcher Tabs */}
        <div
          style={{
            display: "flex",
            background: C.paperDark,
            padding: 4,
            borderRadius: 12,
            border: `1px solid ${C.line}`,
            gap: 4,
          }}
        >
          <button
            id="tab-recent-trips"
            type="button"
            onClick={() => setView("recent")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: view === "recent" ? C.card : "transparent",
              color: view === "recent" ? C.ink : C.inkSoft,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: view === "recent" ? "0 2px 5px rgba(0,0,0,0.05)" : "none",
            }}
          >
            <Compass size={16} color={view === "recent" ? C.marigoldDark : C.inkSoft} />
            Recent Trips ({trips.length})
          </button>
          <button
            id="tab-create-new-trip"
            type="button"
            onClick={() => setView("create")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: view === "create" ? C.card : "transparent",
              color: view === "create" ? C.teal : C.inkSoft,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: view === "create" ? "0 2px 5px rgba(0,0,0,0.05)" : "none",
            }}
          >
            <Plus size={16} color={view === "create" ? C.teal : C.inkSoft} />
            + Create New Trip
          </button>
        </div>

        {/* ----------------- VIEW 1: RECENT TRIPS LIST ----------------- */}
        {view === "recent" && (
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
              <button
                id="btn-quick-create-trip"
                type="button"
                onClick={() => setView("create")}
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
                      You are not currently part of any travel groups. Join a trip with a friend's invite code or create a new trip.
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
                      onClick={() => setView("create")}
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
                const totalSpent = t.expenses
                  .filter((e) => !e.deleted)
                  .reduce((sum, e) => sum + e.amount, 0);

                const confirmedPayments = t.payments.filter((p) => p.status === "PAID" || p.status === "confirmed");
                const totalSettledAmount = confirmedPayments.reduce((s, p) => s + p.amount, 0);
                let settledPercentage = 100;
                let totalExpectedDebt = 0;
                if (totalSpent > 0) {
                  let bal: Record<string, { paid: number; share: number }> = {};
                  t.members.forEach((m) => (bal[m.id] = { paid: 0, share: 0 }));
                  t.expenses.filter(e => !e.deleted).forEach((e) => {
                    if (e.payers && Object.keys(e.payers).length > 0) {
                      Object.entries(e.payers).forEach(([pid, paidAmt]) => {
                        if (bal[pid]) bal[pid].paid += (Number(paidAmt) || 0);
                      });
                    } else if (bal[e.paidBy]) {
                      bal[e.paidBy].paid += e.amount;
                    }
                    Object.entries(e.splits || {}).forEach(([id, amt]) => {
                      if (bal[id]) bal[id].share += (Number(amt) || 0);
                    });
                  });
                  Object.values(bal).forEach(b => {
                    const net = b.paid - b.share;
                    if (net > 0.01) totalExpectedDebt += net;
                  });
                  if (totalExpectedDebt > 0) {
                    settledPercentage = Math.min(100, Math.max(0, Math.round((totalSettledAmount / totalExpectedDebt) * 100)));
                  }
                }

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

                      {/* Right Action */}
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
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Are you sure you want to delete "${t.title}"? This cannot be undone.`
                                )
                              ) {
                                onDeleteTrip(t.id);
                              }
                            }}
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

                    {/* Stats & Members Bar */}
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
                        <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.paperDark, padding: "2px 6px", borderRadius: 12 }}>
                           <div style={{ width: 40, height: 4, background: C.line, borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${settledPercentage}%`, height: '100%', background: settledPercentage === 100 ? C.teal : C.marigoldDark }} />
                           </div>
                           <span style={{ fontSize: 10, fontWeight: 700, color: C.inkSoft }}>
                             {settledPercentage}% settled
                           </span>
                        </div>
                        <span style={{ color: C.inkSoft, fontSize: 11.5 }}>
                          {t.expenses.filter((e) => !e.deleted).length} expenses
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
          </div>
        )}

        {/* ----------------- VIEW 2: CREATE NEW TRIP ----------------- */}
        {view === "create" && (
          <form
            onSubmit={handleCreateSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            {formError && (
              <div
                style={{
                  background: C.rustSoft,
                  border: `1.5px solid ${C.rust}`,
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: C.rust,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AlertCircle size={15} />
                {formError}
              </div>
            )}

            {/* Trip General Info */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    color: C.inkSoft,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Trip Title *
                </label>
                <input
                  id="new-trip-title-input"
                  type="text"
                  placeholder="e.g. Goa Beach Vacation 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    fontSize: 13.5,
                    boxSizing: "border-box",
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    color: C.inkSoft,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Destination *
                </label>
                <input
                  id="new-trip-location-input"
                  type="text"
                  placeholder="e.g. Goa, India"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    fontSize: 13.5,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Dates & Currency */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", gap: 10 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    color: C.inkSoft,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 8px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    fontSize: 12.5,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    color: C.inkSoft,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 8px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    fontSize: 12.5,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    color: C.inkSoft,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 8px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    fontSize: 12.5,
                    boxSizing: "border-box",
                  }}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="AED">AED (د.إ)</option>
                </select>
              </div>
            </div>

            {/* Creator Profile Section (Mandatory WhatsApp) */}
            <div
              style={{
                background: C.paperDark,
                border: `1.5px solid ${C.line}`,
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={14} color={C.marigoldDark} />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: C.ink,
                    textTransform: "uppercase",
                  }}
                >
                  Your Account Details (Trip Creator & Owner)
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, display: "block" }}>
                    Your Name *
                  </label>
                  <input
                    id="creator-name-input"
                    type="text"
                    placeholder="e.g. Ayan Roy"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${C.line}`,
                      background: C.card,
                      color: C.ink,
                      fontSize: 12.5,
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: C.waText,
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Phone size={10} /> WhatsApp Number * (Required)
                  </label>
                  <input
                    id="creator-phone-input"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={creatorPhone}
                    onChange={(e) => setCreatorPhone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1.5px solid ${C.waBorder}`,
                      background: C.card,
                      color: C.ink,
                      fontSize: 12.5,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Additional Members List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 800,
                    color: C.inkSoft,
                    textTransform: "uppercase",
                  }}
                >
                  Add Friends / Fellow Travelers
                </span>
                <button
                  type="button"
                  onClick={handleAddMemberRow}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.teal,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  + Add Friend
                </button>
              </div>

              {additionalMembers.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1.2fr auto",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Friend's Name"
                    value={m.name}
                    onChange={(e) => handleMemberChange(idx, "name", e.target.value)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${C.line}`,
                      background: C.card,
                      fontSize: 12,
                    }}
                  />
                  <input
                    type="tel"
                    placeholder="WhatsApp No. (Optional)"
                    value={m.phone}
                    onChange={(e) => handleMemberChange(idx, "phone", e.target.value)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${m.name ? "#25D366" : C.line}`,
                      background: C.card,
                      fontSize: 12,
                    }}
                  />
                  {additionalMembers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMemberRow(idx)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: C.rust,
                        cursor: "pointer",
                        padding: 4,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                borderTop: `1px solid ${C.line}`,
                paddingTop: 12,
              }}
            >
              <button
                type="button"
                onClick={() => setView("recent")}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${C.line}`,
                  background: C.paperDark,
                  color: C.inkSoft,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                id="btn-submit-create-trip"
                type="submit"
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: C.teal,
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Sparkles size={14} /> Create Trip
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}
