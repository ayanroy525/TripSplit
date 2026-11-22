import React, { useState } from "react";
import { Users, Trash2, Phone, AlertCircle, Sparkles } from "lucide-react";
import { Trip, Member, UserAccount } from "../../types";
import { C, PRESET_AVATAR_PALETTE } from "../../utils/constants";
import { uid } from "../../utils/calculations";
import { isValidWhatsAppPhone } from "../../utils/whatsappNotifications";

interface CreateTripFormProps {
  authUser: UserAccount | null;
  onCreateTrip: (newTrip: Trip) => void;
  onCancel: () => void;
  onClose: () => void;
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  color: C.inkSoft,
  display: "block",
  marginBottom: 4,
};

const textInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${C.line}`,
  background: C.card,
  fontSize: 13.5,
  boxSizing: "border-box",
};

const compactInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 8px",
  borderRadius: 8,
  border: `1px solid ${C.line}`,
  background: C.card,
  fontSize: 12.5,
  boxSizing: "border-box",
};

export function CreateTripForm({
  authUser,
  onCreateTrip,
  onCancel,
  onClose,
}: CreateTripFormProps) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0];
  });
  const [currency, setCurrency] = useState("INR");
  const [creatorName, setCreatorName] = useState(authUser?.name || "");
  const [creatorPhone, setCreatorPhone] = useState(authUser?.phone || "");
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

  const handleMemberChange = (idx: number, field: "name" | "phone", value: string) => {
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

    for (let i = 0; i < additionalMembers.length; i++) {
      const m = additionalMembers[i];
      if (m.name.trim() && !m.phone.trim()) {
        setFormError(`WhatsApp number is mandatory for member "${m.name}".`);
        return;
      }
      if (m.name.trim() && !isValidWhatsAppPhone(m.phone)) {
        setFormError(`Please provide a valid 10-digit WhatsApp number for "${m.name}".`);
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
    <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10 }}>
        <div>
          <label style={fieldLabelStyle}>Trip Title *</label>
          <input
            id="new-trip-title-input"
            type="text"
            placeholder="e.g. Goa Beach Vacation 2026"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={textInputStyle}
            autoFocus
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Destination *</label>
          <input
            id="new-trip-location-input"
            type="text"
            placeholder="e.g. Goa, India"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={textInputStyle}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", gap: 10 }}>
        <div>
          <label style={fieldLabelStyle}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={compactInputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={compactInputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={compactInputStyle}
          >
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="AED">AED (د.إ)</option>
          </select>
        </div>
      </div>

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
              placeholder="e.g. Alex Morgan"
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

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
          onClick={onCancel}
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
  );
}
