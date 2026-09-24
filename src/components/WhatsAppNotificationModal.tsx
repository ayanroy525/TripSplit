import React, { useState, useMemo } from "react";
import {
  MessageCircle,
  Copy,
  Check,
  Send,
  ExternalLink,
  Users,
  User,
  Phone,
  AlertTriangle,
  Info,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Expense, Member, Trip, WhatsAppNotificationPayload } from "../types";
import { C } from "../utils/constants";
import { Avatar, ModalShell } from "./Atoms";
import {
  getWhatsAppDirectLink,
  getWhatsAppShareLink,
  isValidWhatsAppPhone,
  generateIndividualExpenseWhatsAppMsg,
} from "../utils/whatsappNotifications";

export type { WhatsAppNotificationPayload };

interface WhatsAppNotificationModalProps {
  payload: WhatsAppNotificationPayload;
  members: Member[];
  onClose: () => void;
}

export function WhatsAppNotificationModal({
  payload,
  members,
  onClose,
}: WhatsAppNotificationModalProps) {
  const [activeMode, setActiveMode] = useState<"group" | "individual">(
    payload.targetMemberIds?.length === 1 ? "individual" : "group"
  );
  const [copiedGroup, setCopiedGroup] = useState(false);
  const [copiedIndividual, setCopiedIndividual] = useState(false);
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  // Filter members if targetMemberIds is provided
  const relevantMembers = useMemo(() => {
    if (payload.targetMemberIds && payload.targetMemberIds.length > 0) {
      return members.filter((m) => payload.targetMemberIds?.includes(m.id));
    }
    return members;
  }, [members, payload.targetMemberIds]);

  // Selected member for individual preview
  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => {
    return relevantMembers[0]?.id || members[0]?.id || "";
  });

  const selectedMember = useMemo(() => {
    return members.find((m) => m.id === selectedMemberId) || relevantMembers[0] || members[0];
  }, [members, relevantMembers, selectedMemberId]);

  // Get or compute the personalized individual message for any member
  const getIndividualMessage = (member: Member): string => {
    if (payload.individualMessages && payload.individualMessages[member.id]) {
      return payload.individualMessages[member.id];
    }
    if (payload.trip && payload.expense) {
      return generateIndividualExpenseWhatsAppMsg(
        payload.trip,
        payload.expense,
        member,
        payload.creatorName || "Trip Admin"
      );
    }
    // Fallback: customized greeting prepended to messageText
    return `👋 *Hi ${member.name}!* \n\n${payload.messageText}`;
  };

  const currentIndividualMessage = selectedMember ? getIndividualMessage(selectedMember) : "";

  const handleCopyGroup = () => {
    navigator.clipboard.writeText(payload.messageText);
    setCopiedGroup(true);
    setTimeout(() => setCopiedGroup(false), 2200);
  };

  const handleCopyIndividual = () => {
    if (!currentIndividualMessage) return;
    navigator.clipboard.writeText(currentIndividualMessage);
    setCopiedIndividual(true);
    setTimeout(() => setCopiedIndividual(false), 2200);
  };

  const handleSendToGroup = () => {
    const url = getWhatsAppShareLink(payload.messageText);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSendToIndividual = (m: Member) => {
    if (!m.phone) return;
    const msg = getIndividualMessage(m);
    const url = getWhatsAppDirectLink(m.phone, msg);
    window.open(url, "_blank", "noopener,noreferrer");
    setSentMap((prev) => ({ ...prev, [m.id]: true }));
  };

  return (
    <ModalShell
      title="WhatsApp Notification"
      subtitle={payload.subtitle || "Broadcast updates or send individual itemized notices via WhatsApp"}
      onClose={onClose}
      width={600}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Banner */}
        <div
          style={{
            background: "#E7F8EE",
            border: "1.5px solid #25D366",
            borderRadius: 14,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#25D366",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 2px 6px rgba(37, 211, 102, 0.3)",
              }}
            >
              <MessageCircle size={20} />
            </div>
            <div>
              <h4
                style={{
                  margin: 0,
                  fontSize: 14.5,
                  fontWeight: 800,
                  color: "#125C2B",
                  fontFamily: "'Fraunces', serif",
                }}
              >
                {payload.title}
              </h4>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#1F783E" }}>
                Send to WhatsApp group or send personalized individual 1-on-1 notices.
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Toggle: Group Broadcast vs Individual Member Notices */}
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
            id="tab-mode-group"
            type="button"
            onClick={() => setActiveMode("group")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: activeMode === "group" ? C.card : "transparent",
              color: activeMode === "group" ? C.ink : C.inkSoft,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: activeMode === "group" ? "0 1px 4px rgba(0,0,0,0.15)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <Users size={15} color={activeMode === "group" ? "#25D366" : C.inkSoft} />
            <span>Group Chat Broadcast</span>
          </button>

          <button
            id="tab-mode-individual"
            type="button"
            onClick={() => setActiveMode("individual")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: activeMode === "individual" ? C.card : "transparent",
              color: activeMode === "individual" ? C.ink : C.inkSoft,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: activeMode === "individual" ? "0 1px 4px rgba(0,0,0,0.15)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <User size={15} color={activeMode === "individual" ? C.teal : C.inkSoft} />
            <span>Personalized Individual Notices ({relevantMembers.length})</span>
          </button>
        </div>

        {/* ----------------- MODE 1: GROUP BROADCAST ----------------- */}
        {activeMode === "group" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
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
                  Group Broadcast Message Preview
                </span>
                <button
                  id="btn-copy-group-whatsapp-text"
                  type="button"
                  onClick={handleCopyGroup}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: C.paperDark,
                    border: `1px solid ${C.line}`,
                    borderRadius: 8,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: copiedGroup ? C.teal : C.ink,
                    cursor: "pointer",
                  }}
                >
                  {copiedGroup ? <Check size={13} color={C.teal} /> : <Copy size={13} />}
                  {copiedGroup ? "Copied!" : "Copy Text"}
                </button>
              </div>

              <div
                style={{
                  background: C.paperDark,
                  border: `1.5px solid ${C.line}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  color: C.ink,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  maxHeight: 170,
                  overflowY: "auto",
                }}
              >
                {payload.messageText}
              </div>
            </div>

            {/* Primary Action: Send to Group */}
            <button
              id="btn-send-whatsapp-group"
              type="button"
              onClick={handleSendToGroup}
              style={{
                background: "#25D366",
                color: "#ffffff",
                border: "none",
                borderRadius: 12,
                padding: "12px 18px",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 3px 10px rgba(37, 211, 102, 0.25)",
              }}
            >
              <MessageCircle size={18} />
              Send to WhatsApp Group Chat
              <ExternalLink size={14} style={{ opacity: 0.8 }} />
            </button>
          </div>
        )}

        {/* ----------------- MODE 2: INDIVIDUAL NOTICES ----------------- */}
        {activeMode === "individual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Member selector chips */}
            <div>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: C.inkSoft,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Select Member to Preview & Notify:
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  overflowX: "auto",
                  paddingBottom: 4,
                }}
              >
                {relevantMembers.map((m) => {
                  const isSelected = m.id === selectedMemberId;
                  const isSent = sentMap[m.id];
                  const hasPhone = isValidWhatsAppPhone(m.phone);

                  return (
                    <button
                      key={m.id}
                      id={`chip-select-member-${m.id}`}
                      type="button"
                      onClick={() => setSelectedMemberId(m.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: isSelected ? `2px solid ${C.teal}` : `1px solid ${C.line}`,
                        background: isSelected ? C.tealSoft : C.paperDark,
                        color: isSelected ? C.teal : C.ink,
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Avatar member={m} size={18} />
                      <span>{m.name}</span>
                      {isSent ? (
                        <Check size={12} color={C.teal} strokeWidth={3} />
                      ) : !hasPhone ? (
                        <AlertTriangle size={11} color={C.rust} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Individual Message Preview Box */}
            {selectedMember && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 800,
                        color: C.inkSoft,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Individual Message for: <b>{selectedMember.name}</b>
                    </span>
                    {selectedMember.phone && (
                      <span
                        style={{
                          fontSize: 11,
                          color: C.inkSoft,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        ({selectedMember.phone})
                      </span>
                    )}
                  </div>

                  <button
                    id={`btn-copy-individual-${selectedMember.id}`}
                    type="button"
                    onClick={handleCopyIndividual}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: C.paperDark,
                      border: `1px solid ${C.line}`,
                      borderRadius: 8,
                      padding: "3px 8px",
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: copiedIndividual ? C.teal : C.ink,
                      cursor: "pointer",
                    }}
                  >
                    {copiedIndividual ? <Check size={12} color={C.teal} /> : <Copy size={12} />}
                    {copiedIndividual ? "Copied!" : "Copy"}
                  </button>
                </div>

                <div
                  style={{
                    background: C.paperDark,
                    border: `1.5px solid ${C.line}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: C.ink,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    maxHeight: 160,
                    overflowY: "auto",
                  }}
                >
                  {currentIndividualMessage}
                </div>

                {/* Primary Button to Send to Currently Selected Member */}
                <div style={{ marginTop: 10 }}>
                  {isValidWhatsAppPhone(selectedMember.phone) ? (
                    <button
                      id={`btn-send-individual-${selectedMember.id}`}
                      type="button"
                      onClick={() => handleSendToIndividual(selectedMember)}
                      style={{
                        width: "100%",
                        background: "#25D366",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 10,
                        padding: "10px 16px",
                        fontSize: 13.5,
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        boxShadow: "0 2px 6px rgba(37, 211, 102, 0.25)",
                      }}
                    >
                      <Send size={15} />
                      <span>
                        {sentMap[selectedMember.id]
                          ? `Resend WhatsApp to ${selectedMember.name}`
                          : `Send WhatsApp to ${selectedMember.name} (${selectedMember.phone})`}
                      </span>
                    </button>
                  ) : (
                    <div
                      style={{
                        background: C.rustSoft,
                        border: `1px solid ${C.rust}`,
                        borderRadius: 10,
                        padding: "8px 12px",
                        fontSize: 12.5,
                        color: C.rust,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <AlertTriangle size={15} />
                      <span>
                        <b>{selectedMember.name}</b> does not have a registered WhatsApp phone number.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* List of all members for quick one-click actions */}
            <div style={{ marginTop: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: C.inkSoft,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                All Individual Recipient Channels:
              </span>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxHeight: 140,
                  overflowY: "auto",
                }}
              >
                {relevantMembers.map((m) => {
                  const hasPhone = isValidWhatsAppPhone(m.phone);
                  const isSent = sentMap[m.id];

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: C.paperDark,
                        border: `1px solid ${m.id === selectedMemberId ? C.teal : C.line}`,
                        borderRadius: 8,
                        padding: "6px 10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar member={m} size={22} />
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>
                          {m.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: hasPhone ? C.inkSoft : C.rust,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {hasPhone ? m.phone : "No Phone"}
                        </span>
                      </div>

                      {hasPhone ? (
                        <button
                          id={`btn-quick-send-member-${m.id}`}
                          type="button"
                          onClick={() => handleSendToIndividual(m)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: isSent ? "#E7F8EE" : "#25D366",
                            color: isSent ? "#125C2B" : "#ffffff",
                            border: isSent ? "1px solid #25D366" : "none",
                            borderRadius: 6,
                            padding: "4px 8px",
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {isSent ? <Check size={11} /> : <Send size={10} />}
                          {isSent ? "Sent ✓" : "Send"}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10.5, color: C.rust, fontWeight: 700 }}>
                          Need phone
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer info & Close */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${C.line}`,
            paddingTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11.5,
              color: C.inkSoft,
            }}
          >
            <Info size={13} color={C.teal} />
            <span>Opens WhatsApp web or mobile app directly with pre-filled content</span>
          </div>

          <button
            id="btn-close-whatsapp-modal"
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: `1px solid ${C.line}`,
              background: C.paperDark,
              color: C.ink,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
