import React, { useState } from "react";
import {
  Share2,
  MessageCircle,
  Copy,
  Check,
  QrCode,
  Users,
  ExternalLink,
  Sparkles,
  Link as LinkIcon,
  Shield,
  RefreshCw,
  Ban,
  AlertCircle,
} from "lucide-react";
import { Trip, Member } from "../types";
import { C } from "../utils/constants";
import { ModalShell } from "./Atoms";
import {
  generateTripInviteWhatsAppMsg,
  getWhatsAppShareLink,
} from "../utils/whatsappNotifications";
import { supabase } from "../utils/supabaseClient";

interface InviteMembersModalProps {
  trip: Trip;
  currentUserName: string;
  currentUser?: Member;
  onUpdateTrip?: (trip: Trip) => void;
  onOpenSelfRegister: () => void;
  onClose: () => void;
}

export function InviteMembersModal({
  trip,
  currentUserName,
  currentUser,
  onUpdateTrip,
  onOpenSelfRegister,
  onClose,
}: InviteMembersModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  // Check if current user is owner
  const isOwner =
    Boolean(currentUser && (trip.ownerId === currentUser.id || trip.members.find((m) => m.id === currentUser.id)?.role === "owner"));

  // Check if invite code exists / is active
  const isRevoked = !trip.inviteCode;
  const currentInviteCode = trip.inviteCode || `TRIP-${trip.id.slice(-6).toUpperCase()}`;
  const inviteLink = isRevoked
    ? ""
    : `${window.location.origin}${window.location.pathname}#join?tripId=${trip.id}`;

  const whatsAppMsg = generateTripInviteWhatsAppMsg(
    trip,
    currentUserName,
    inviteLink,
    currentInviteCode
  );

  const handleCopyLink = () => {
    if (isRevoked) return;
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    if (isRevoked) return;
    navigator.clipboard.writeText(currentInviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSendWhatsApp = () => {
    if (isRevoked) return;
    const url = getWhatsAppShareLink(whatsAppMsg);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleRegenerateInvite = async () => {
    setIsLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const newCode = `TRIP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const { error } = await supabase
        .from("trips")
        .update({ invite_code: newCode })
        .eq("id", trip.id);

      if (error) {
        throw new Error(error.message);
      }

      const updatedTrip: Trip = { ...trip, inviteCode: newCode };
      if (onUpdateTrip) onUpdateTrip(updatedTrip);
      setActionSuccess(`New invite code generated: ${newCode}`);
    } catch (err: any) {
      setActionError(err.message || "Failed to regenerate invite code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeInvite = async () => {
    setIsLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const { error } = await supabase
        .from("trips")
        .update({ invite_code: null })
        .eq("id", trip.id);

      if (error) {
        throw new Error(error.message);
      }

      const updatedTrip: Trip = { ...trip, inviteCode: undefined };
      if (onUpdateTrip) onUpdateTrip(updatedTrip);
      setActionSuccess("Invite code revoked. New members cannot join using the previous link.");
      setConfirmRevoke(false);
    } catch (err: any) {
      setActionError(err.message || "Failed to revoke invite code.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ModalShell
      title="Invite Friends to Trip"
      subtitle={`Let friends join "${trip.title}" and register their own profile`}
      onClose={onClose}
      width={560}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {actionError && (
          <div
            style={{
              background: "rgba(225, 29, 72, 0.12)",
              border: "1px solid var(--c-rust, #E11D48)",
              color: "var(--c-rust, #E11D48)",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircle size={16} />
            <span>{actionError}</span>
          </div>
        )}

        {actionSuccess && (
          <div
            style={{
              background: "rgba(45, 212, 191, 0.12)",
              border: "1px solid var(--c-teal, #2DD4BF)",
              color: "var(--c-teal, #2DD4BF)",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Check size={16} />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* If Revoked Banner */}
        {isRevoked ? (
          <div
            style={{
              background: "rgba(225, 29, 72, 0.08)",
              border: "1.5px solid var(--c-rust, #E11D48)",
              borderRadius: 14,
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "var(--c-rust, #E11D48)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ban size={20} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--c-ink, #F8FAFC)" }}>
                  Invite Link is Currently Inactive / Revoked
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--c-inkSoft, #94A3B8)" }}>
                  New members cannot join with previous links or codes. Existing members remain unaffected.
                </p>
              </div>
            </div>

            {isOwner && (
              <button
                id="btn-owner-regenerate-invite-revoked"
                type="button"
                disabled={isLoading}
                onClick={handleRegenerateInvite}
                style={{
                  background: "var(--c-teal, #2DD4BF)",
                  color: "var(--c-teal-contrast-text, #0F172A)",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  alignSelf: "flex-start",
                }}
              >
                <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                Generate New Invite Code
              </button>
            )}
          </div>
        ) : (
          /* Highlight Card */
          <div
            style={{
              background: "#E7F8EE",
              border: "1.5px solid #25D366",
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "#25D366",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 6px rgba(37, 211, 102, 0.3)",
                }}
              >
                <MessageCircle size={22} />
              </div>
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#125C2B",
                    fontFamily: "'Fraunces', serif",
                  }}
                >
                  1-Click WhatsApp Group Invitation
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#1F783E" }}>
                  Send an invite link to your WhatsApp group so friends can register their own name & phone number.
                </p>
              </div>
            </div>

            <button
              id="btn-invite-send-whatsapp"
              type="button"
              onClick={handleSendWhatsApp}
              style={{
                background: "#25D366",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                padding: "11px 16px",
                fontSize: 13.5,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 3px 8px rgba(37, 211, 102, 0.25)",
              }}
            >
              <MessageCircle size={17} />
              Share Invitation on WhatsApp
              <ExternalLink size={14} style={{ opacity: 0.8 }} />
            </button>
          </div>
        )}

        {!isRevoked && (
          /* Invite Link & Code Details */
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Direct Invite Link */}
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--c-inkSoft, #94A3B8)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Trip Join Link
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--c-paperDark, #0F172A)",
                  border: "1px solid var(--c-line, #334155)",
                  borderRadius: 10,
                  padding: "8px 12px",
                }}
              >
                <LinkIcon size={14} color="var(--c-inkSoft, #94A3B8)" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    fontSize: 12,
                    color: "var(--c-ink, #F8FAFC)",
                    width: "100%",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
                <button
                  id="btn-copy-invite-link"
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: "var(--c-card, #1E293B)",
                    border: "1px solid var(--c-line, #334155)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: copiedLink ? "var(--c-teal, #2DD4BF)" : "var(--c-ink, #F8FAFC)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {copiedLink ? <Check size={12} color="var(--c-teal, #2DD4BF)" /> : <Copy size={12} />}
                  {copiedLink ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Invite Code & Self Register button */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div
                style={{
                  background: "var(--c-card, #1E293B)",
                  border: "1px solid var(--c-line, #334155)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--c-inkSoft, #94A3B8)", textTransform: "uppercase" }}>
                  Trip Invite Code
                </span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 15,
                      fontWeight: 800,
                      color: "var(--c-marigoldDark, #F59E0B)",
                    }}
                  >
                    {currentInviteCode}
                  </span>
                  <button
                    id="btn-copy-invite-code"
                    type="button"
                    onClick={handleCopyCode}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 2,
                      color: copiedCode ? "var(--c-teal, #2DD4BF)" : "var(--c-inkSoft, #94A3B8)",
                    }}
                    title="Copy code"
                  >
                    {copiedCode ? <Check size={14} color="var(--c-teal, #2DD4BF)" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Test Self-Registration on this Device */}
              <div
                style={{
                  background: "var(--c-paperDark, #0F172A)",
                  border: "1px dashed var(--c-line, #334155)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 4,
                }}
              >
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--c-teal, #2DD4BF)", textTransform: "uppercase" }}>
                    Join as New User
                  </span>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--c-inkSoft, #94A3B8)" }}>
                    Register yourself as a new member on this device.
                  </p>
                </div>
                <button
                  id="btn-open-self-register-from-invite"
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSelfRegister();
                  }}
                  style={{
                    background: "var(--c-teal, #2DD4BF)",
                    color: "var(--c-teal-contrast-text, #0F172A)",
                    border: "none",
                    borderRadius: 6,
                    padding: "5px 10px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  + Register Myself
                </button>
              </div>
            </div>
          </div>
        )}

        {/* QR Code / Visual Ticket Box */}
        {!isRevoked && (
          <div
            style={{
              background: "var(--c-card, #1E293B)",
              border: "1.5px solid var(--c-line, #334155)",
              borderRadius: 12,
              padding: "14px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 10,
                background: "var(--c-paperDark, #0F172A)",
                border: "1px solid var(--c-line, #334155)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <QrCode size={44} color="var(--c-ink, #F8FAFC)" />
            </div>
            <div>
              <h5 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "var(--c-ink, #F8FAFC)" }}>
                Scan or Share Code in Person
              </h5>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-inkSoft, #94A3B8)", lineHeight: 1.4 }}>
                Friends can scan the trip code or click the invite link from any phone browser to join instantly.
              </p>
            </div>
          </div>
        )}

        {/* Owner Security Controls (Rule 8) */}
        {isOwner && (
          <div
            style={{
              background: "var(--c-card, #1E293B)",
              border: "1px solid var(--c-line, #334155)",
              borderRadius: 12,
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={16} color="var(--c-marigold, #F59E0B)" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--c-ink, #F8FAFC)" }}>
                Trip Owner Security Controls
              </span>
            </div>

            <p style={{ margin: 0, fontSize: 11.5, color: "var(--c-inkSoft, #94A3B8)", lineHeight: 1.4 }}>
              As the trip owner, you can regenerate or revoke the invite code at any time. Revoking disables the current link without affecting existing trip members.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
              {!isRevoked && (
                <>
                  <button
                    id="btn-owner-regenerate-invite"
                    type="button"
                    disabled={isLoading}
                    onClick={handleRegenerateInvite}
                    style={{
                      background: "var(--c-paperDark, #0F172A)",
                      border: "1px solid var(--c-line, #334155)",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--c-ink, #F8FAFC)",
                      cursor: isLoading ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
                    Regenerate New Code
                  </button>

                  {!confirmRevoke ? (
                    <button
                      id="btn-owner-prompt-revoke-invite"
                      type="button"
                      disabled={isLoading}
                      onClick={() => setConfirmRevoke(true)}
                      style={{
                        background: "rgba(225, 29, 72, 0.1)",
                        border: "1px solid var(--c-rust, #E11D48)",
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--c-rust, #E11D48)",
                        cursor: isLoading ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ban size={13} />
                      Revoke Invite Code
                    </button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        id="btn-owner-confirm-revoke-invite"
                        type="button"
                        disabled={isLoading}
                        onClick={handleRevokeInvite}
                        style={{
                          background: "var(--c-rust, #E11D48)",
                          border: "none",
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#ffffff",
                          cursor: isLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        Confirm Revoke
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(false)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--c-inkSoft, #94A3B8)",
                          fontSize: 12,
                          cursor: "pointer",
                          padding: "4px 8px",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Close button */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            borderTop: "1px solid var(--c-line, #334155)",
            paddingTop: 12,
          }}
        >
          <button
            id="btn-close-invite-modal"
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 18px",
              borderRadius: 8,
              border: "1px solid var(--c-line, #334155)",
              background: "var(--c-paperDark, #0F172A)",
              color: "var(--c-ink, #F8FAFC)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
