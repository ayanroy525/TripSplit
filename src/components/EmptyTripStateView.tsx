import React, { useState } from "react";
import {
  Compass,
  KeyRound,
  Plus,
  ShieldCheck,
  Receipt,
  Users,
  Wallet,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  User,
  LogIn,
  ChevronRight,
} from "lucide-react";
import { C } from "../utils/constants";
import { UserAccount, Trip, Member } from "../types";
import { supabase } from "../utils/supabaseClient";
import { addMemberToDatabase, getTripFromDatabase } from "../utils/storage";

interface EmptyTripStateViewProps {
  authUser: UserAccount | null;
  onOpenJoinModal: () => void;
  onOpenCreateTrip: () => void;
  onJoinSuccess: (joinedTrip: Trip) => void;
  onLogout?: () => void;
  onOpenUserProfile?: () => void;
}

export function EmptyTripStateView({
  authUser,
  onOpenJoinModal,
  onOpenCreateTrip,
  onJoinSuccess,
  onLogout,
  onOpenUserProfile,
}: EmptyTripStateViewProps) {
  const [inlineCode, setInlineCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleQuickJoin = async (codeToUse?: string) => {
    const code = (codeToUse || inlineCode).trim().toUpperCase();
    setErrorMsg("");
    setSuccessMsg("");

    if (!code) {
      setErrorMsg("Please enter an invite code to join.");
      return;
    }

    const currentUserId = authUser?.id;
    if (!currentUserId || !authUser) {
      setErrorMsg("Please log in before joining a trip.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Direct Supabase query for matching inviteCode
      const { data: tripRows, error: tripErr } = await supabase
        .from("trips")
        .select("*")
        .ilike("invite_code", code)
        .limit(1);

      if (tripErr || !tripRows || tripRows.length === 0) {
        setErrorMsg(`Invite code '${code}' is invalid or expired. Please check with your trip organizer.`);
        return;
      }

      const tripData = tripRows[0];
      const tripId = tripData.id;

      // 2. Check if already a member
      const { data: membersRows } = await supabase
        .from("trip_members")
        .select("*")
        .eq("trip_id", tripId);

      const existingMembers: Member[] = (membersRows || []).map((d: any) => ({
        id: d.id,
        userId: d.user_id || d.id,
        name: d.name || "Traveler",
        role: d.role || "MEMBER",
        avatarColor: d.avatar_color || "#0F6B65",
        phone: d.phone,
        email: d.email,
        joinedAt: d.joined_at,
      }));

      const isAlreadyMember = existingMembers.some(
        (m) => m.id === currentUserId || m.userId === currentUserId
      );

      if (isAlreadyMember) {
        setErrorMsg(`You are already a member of "${tripData.title || "this trip"}".`);
        // Load existing trip directly
        const existingTrip = await getTripFromDatabase(tripId);
        if (existingTrip) {
          setTimeout(() => {
            onJoinSuccess(existingTrip);
          }, 400);
        }
        return;
      }

      // 3. Add new member directly in Supabase
      const newMember: Member = {
        id: currentUserId,
        userId: currentUserId,
        name: authUser.name || "New Traveler",
        role: "member",
        avatarColor: authUser.avatarColor || "#0F6B65",
        phone: authUser.phone || "",
        email: authUser.email || "",
        joinedAt: new Date().toISOString(),
      };

      await addMemberToDatabase(tripId, newMember);

      // 4. Update member_user_ids in parent trip document
      const currentMemberIds = existingMembers.map((m) => m.id || m.userId);
      const updatedMemberIds = Array.from(new Set([...currentMemberIds, currentUserId]));

      await supabase.from("trips").update({
        member_user_ids: updatedMemberIds,
      }).eq("id", tripId);

      // 5. Fetch the complete trip
      const fullJoinedTrip = await getTripFromDatabase(tripId);

      if (fullJoinedTrip) {
        setSuccessMsg(`Joined "${fullJoinedTrip.title}"! Loading your trip dashboard...`);
        setTimeout(() => {
          onJoinSuccess(fullJoinedTrip);
        }, 500);
      } else {
        setErrorMsg("Joined trip, but could not load details. Please refresh.");
      }
    } catch (err: any) {
      console.error("Direct Supabase quick-join failed:", err);
      setErrorMsg(
        err.message ||
          `Invite code '${code}' could not be processed. Please check your connection and try again.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const userName = authUser?.name || "Traveler";

  return (
    <div
      id="view-empty-trips-onboarding"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 720,
        margin: "0 auto",
        padding: "8px 16px 48px 16px",
      }}
    >
      {/* Top Quick Bar: Brand + User Pill + Log Out / Back to Login Button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 4px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: C.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
            }}
          >
            <Compass size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, lineHeight: 1.2 }}>
              SplitTrip
            </div>
            <div style={{ fontSize: 11, color: C.inkSoft }}>Trip Expense Splitter</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onOpenUserProfile && (
            <button
              id="btn-empty-user-profile"
              type="button"
              onClick={onOpenUserProfile}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: C.card,
                border: `1px solid ${C.line}`,
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 12.5,
                fontWeight: 700,
                color: C.ink,
                cursor: "pointer",
              }}
              title="Open profile & switch accounts"
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  backgroundColor: authUser?.avatarColor || "#0F6B65",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {userName.charAt(0).toUpperCase()}
              </div>
              <span>{userName}</span>
            </button>
          )}

          {onLogout && (
            <button
              id="btn-empty-top-logout"
              type="button"
              onClick={onLogout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: C.paperDark,
                border: `1px solid ${C.line}`,
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: C.rust,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Log out and return to Login / Sign Up"
            >
              <LogOut size={13} />
              <span>Log Out / Switch</span>
            </button>
          )}
        </div>
      </div>

      {/* Welcome Hero Card */}
      <div
        style={{
          background: C.card,
          border: `1.5px solid ${C.line}`,
          borderRadius: 20,
          padding: "32px 28px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle decorative background watermark */}
        <div
          style={{
            position: "absolute",
            top: -20,
            right: -20,
            opacity: 0.04,
            pointerEvents: "none",
          }}
        >
          <Compass size={220} />
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Header Row: User Avatar + Title */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                backgroundColor: authUser?.avatarColor || "#0F6B65",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 800,
                boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                fontFamily: "'Fraunces', serif",
              }}
            >
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontSize: 26,
                  color: C.ink,
                  margin: 0,
                  fontWeight: 800,
                  lineHeight: 1.2,
                }}
              >
                Welcome, {userName} 👋
              </h1>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.teal, marginTop: 2 }}>
                Your account is ready.
              </div>
            </div>
          </div>

          <p
            style={{
              fontSize: 14.5,
              color: C.inkSoft,
              lineHeight: 1.6,
              margin: "12px 0 24px",
              maxWidth: 580,
            }}
          >
            You are not part of any travel groups yet. Join your friend&apos;s trip with an invite code or
            create your own new trip to start splitting expenses seamlessly.
          </p>

          {/* Core Action Callouts */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              marginBottom: 24,
            }}
          >
            {/* Action 1: Join Trip */}
            <button
              id="btn-onboarding-join-trip"
              type="button"
              onClick={onOpenJoinModal}
              style={{
                background: C.paperDark,
                border: `1.5px solid ${C.marigoldDark}`,
                borderRadius: 14,
                padding: "16px 18px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: C.card,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.marigoldDark,
                    border: `1px solid ${C.line}`,
                  }}
                >
                  <KeyRound size={20} />
                </div>
                <ArrowRight size={18} color={C.marigoldDark} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>
                  Join with Invite Code
                </div>
                <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
                  Enter a friend&apos;s 6-character trip code to join their group
                </div>
              </div>
            </button>

            {/* Action 2: Create Trip */}
            <button
              id="btn-onboarding-create-trip"
              type="button"
              onClick={onOpenCreateTrip}
              style={{
                background: C.teal,
                border: `1.5px solid ${C.teal}`,
                borderRadius: 14,
                padding: "16px 18px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                color: "#ffffff",
                boxShadow: "0 4px 14px rgba(15, 107, 101, 0.3)",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                  }}
                >
                  <Plus size={20} />
                </div>
                <ArrowRight size={18} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#ffffff" }}>
                  Create a New Trip
                </div>
                <div style={{ fontSize: 12.5, color: "rgba(255, 255, 255, 0.85)", marginTop: 2 }}>
                  Set up a trip, invite buddies, and manage group expenses
                </div>
              </div>
            </button>
          </div>

          {/* Quick Direct Code Input */}
          <div
            style={{
              background: C.paperDark,
              borderRadius: 14,
              border: `1px solid ${C.line}`,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 8 }}>
              Have an invite code right now? Enter it here:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                id="input-quick-invite-code"
                type="text"
                value={inlineCode}
                onChange={(e) => {
                  setInlineCode(e.target.value.toUpperCase());
                  setErrorMsg("");
                }}
                placeholder="Enter 6-10 character invite code"
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${errorMsg ? C.rust : C.line}`,
                  background: C.card,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: C.ink,
                  textTransform: "uppercase",
                  outline: "none",
                }}
              />
              <button
                id="btn-quick-verify-join"
                type="button"
                onClick={() => handleQuickJoin()}
                disabled={isSubmitting || !inlineCode.trim()}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: C.teal,
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: isSubmitting || !inlineCode.trim() ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <ArrowRight size={14} />
                    Join Trip
                  </>
                )}
              </button>
            </div>

            {errorMsg && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: C.rustSoft,
                  border: `1px solid ${C.rust}`,
                  color: C.rust,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: C.tealSoft,
                  border: `1px solid ${C.teal}`,
                  color: C.teal,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          {/* Quick Back to Login / Switch User Banner */}
          {onLogout && (
            <div
              style={{
                marginTop: 18,
                padding: "12px 16px",
                borderRadius: 12,
                background: C.paperDark,
                border: `1px dashed ${C.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 12.5, color: C.inkSoft }}>
                Not <strong>{userName}</strong> or want to sign in with a different account?
              </div>
              <button
                id="btn-hero-back-to-login"
                type="button"
                onClick={onLogout}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  color: C.teal,
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <span>Back to Log In / Sign Up</span>
                <ArrowRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Initial 0-State Metrics Overview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft, fontSize: 12 }}>
            <Wallet size={14} color={C.teal} />
            <span>Trip Spending</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>₹0.00</div>
          <div style={{ fontSize: 11, color: C.inkSoft }}>No expenses recorded</div>
        </div>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft, fontSize: 12 }}>
            <Receipt size={14} color={C.marigoldDark} />
            <span>Net Balance</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.teal }}>₹0.00</div>
          <div style={{ fontSize: 11, color: C.teal }}>All settled</div>
        </div>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft, fontSize: 12 }}>
            <Receipt size={14} color={C.rust} />
            <span>Active Expenses</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>0</div>
          <div style={{ fontSize: 11, color: C.inkSoft }}>0 transactions</div>
        </div>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft, fontSize: 12 }}>
            <Users size={14} color={C.teal} />
            <span>Trip Members</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>0</div>
          <div style={{ fontSize: 11, color: C.inkSoft }}>Not in a group</div>
        </div>
      </div>

      {/* Strict Data Privacy Reassurance Banner */}
      <div
        style={{
          background: C.tealSoft,
          border: `1px solid ${C.teal}`,
          borderRadius: 14,
          padding: "14px 18px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <ShieldCheck size={20} color={C.teal} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.teal }}>
            Strict Data Privacy & Isolation
          </div>
          <div style={{ fontSize: 12, color: C.ink, marginTop: 2, lineHeight: 1.5 }}>
            Your account is completely private and separate. You will only see expenses, balances,
            and member activity for trips you explicitly create or join with an authorized invite
            code.
          </div>
        </div>
      </div>
    </div>
  );
}
