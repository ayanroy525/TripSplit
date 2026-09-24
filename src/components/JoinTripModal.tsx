import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  MapPin,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Loader2,
} from "lucide-react";
import { Trip, Member } from "../types";
import { C } from "../utils/constants";
import { ModalShell } from "./Atoms";
import { formatDate } from "../utils/calculations";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../utils/supabaseClient";
import { addMemberToDatabase, getTripFromDatabase } from "../utils/storage";

interface JoinTripModalProps {
  currentTrip?: Trip | null;
  initialCode?: string;
  onJoinTripSuccess: (joinedTrip: Trip) => void;
  onClose: () => void;
}

export function JoinTripModal({ currentTrip, initialCode = "", onJoinTripSuccess, onClose }: JoinTripModalProps) {
  const { currentUser: authUser } = useAuth();
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [isValidating, setIsValidating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [validatedTrip, setValidatedTrip] = useState<Partial<Trip> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Optional: Auto-validate if initialCode is provided
  useEffect(() => {
    if (initialCode) {
      handleValidateCode(initialCode);
    }
  }, [initialCode]);

  const handleValidateCode = async (codeToVerify?: string) => {
    const code = (codeToVerify || inviteCode).trim().toUpperCase();
    setErrorMsg("");
    setValidatedTrip(null);

    if (!code) {
      setErrorMsg("Please enter your friend's invite code.");
      return;
    }

    setIsValidating(true);

    try {
      // 1. Direct Supabase query for matching inviteCode
      const { data: tripRows, error: tripErr } = await supabase
        .from("trips")
        .select("*")
        .ilike("invite_code", code)
        .limit(1);

      if (tripErr || !tripRows || tripRows.length === 0) {
        setErrorMsg(`Invite code '${code}' is invalid or expired. Check with the trip organizer.`);
        return;
      }

      const tripData = tripRows[0];
      const tripId = tripData.id;

      // 2. Fetch trip members to check if user is already a member
      const { data: membersRows } = await supabase
        .from("trip_members")
        .select("*")
        .eq("trip_id", tripId);

      const currentUserId = authUser?.id;

      const existingMembers: Member[] = (membersRows || []).map((d: any) => ({
        id: d.id,
        userId: d.user_id || d.id,
        name: d.name || "Traveler",
        role: (d.role || "member") as any,
        avatarColor: d.avatar_color || "#0F6B65",
        phone: d.phone,
        email: d.email,
        joinedAt: d.joined_at,
      }));

      const isAlreadyMember =
        currentUserId &&
        existingMembers.some(
          (m) => m.id === currentUserId || m.userId === currentUserId
        );

      if (isAlreadyMember) {
        setErrorMsg(`You are already a member of "${tripData.title || "this trip"}".`);
        return;
      }

      // 3. Construct preview trip object
      setValidatedTrip({
        id: tripId,
        title: tripData.title || "Trip",
        location: tripData.location || tripData.destination || "Destination",
        destination: tripData.destination || tripData.location || "Destination",
        startDate: tripData.start_date || new Date().toISOString().split("T")[0],
        endDate: tripData.end_date || new Date().toISOString().split("T")[0],
        currency: tripData.currency || "INR",
        status: tripData.status || "ACTIVE",
        ownerId: tripData.owner_id || "",
        ownerName: tripData.owner_name || "Organizer",
        inviteCode: tripData.invite_code || code,
        members: existingMembers,
      });
    } catch (err: any) {
      console.error("Direct Supabase invite validation failed:", err);
      setErrorMsg(`Invite code '${code}' is invalid or could not be reached. Please check your network.`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();

    if (!validatedTrip || !validatedTrip.id) {
      await handleValidateCode(code);
      return;
    }

    const currentUserId = authUser?.id;
    if (!currentUserId || !authUser) {
      setErrorMsg("Please log in or sign up before joining a trip.");
      return;
    }

    setIsJoining(true);
    setErrorMsg("");

    try {
      const tripId = validatedTrip.id;

      // 1. Create the new member object using current user
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

      // 2. Add member to trip_members in Supabase
      await addMemberToDatabase(tripId, newMember);

      // 3. Keep root doc member_user_ids synchronized
      const currentMemberIds = validatedTrip.members?.map((m) => m.id || m.userId) || [];
      const updatedMemberIds = Array.from(new Set([...currentMemberIds, currentUserId]));

      await supabase.from("trips").update({
        member_user_ids: updatedMemberIds,
      }).eq("id", tripId);

      // 4. Fetch the complete joined trip
      const fullJoinedTrip = await getTripFromDatabase(tripId);

      setSuccessMsg(`Welcome aboard! You have joined "${validatedTrip.title}".`);
      setTimeout(() => {
        if (fullJoinedTrip) {
          onJoinTripSuccess(fullJoinedTrip);
        }
        onClose();
      }, 600);
    } catch (err: any) {
      console.error("Failed to join trip via Supabase:", err);
      setErrorMsg(err.message || "Failed to join trip in Supabase. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <ModalShell
      title="Join a Trip"
      subtitle="Enter your friend's invite code to join their travel group"
      onClose={onClose}
      width={480}
    >
      <form onSubmit={handleJoinSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* User Badge */}
        {authUser && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: C.paperDark,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "8px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: authUser.avatarColor || "#0F6B65",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {authUser.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{authUser.name}</div>
                <div style={{ fontSize: 11, color: C.inkSoft }}>Joining as authenticated traveler</div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: C.teal,
                background: C.tealSoft,
                padding: "2px 8px",
                borderRadius: 6,
              }}
            >
              Active
            </span>
          </div>
        )}

        {/* Invite Code Input Field */}
        <div>
          <label
            htmlFor="input-trip-invite-code"
            style={{
              display: "block",
              fontSize: 12.5,
              fontWeight: 800,
              color: C.ink,
              marginBottom: 6,
            }}
          >
            Friend's Invite Code
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <KeyRound
                size={16}
                color={C.inkSoft}
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                id="input-trip-invite-code"
                type="text"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  setErrorMsg("");
                  setValidatedTrip(null);
                }}
                placeholder="e.g. 6 to 10-character code"
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 38px",
                  borderRadius: 10,
                  border: `1.5px solid ${errorMsg ? C.rust : C.line}`,
                  background: C.card,
                  color: C.ink,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              id="btn-verify-invite-code"
              type="button"
              onClick={() => handleValidateCode()}
              disabled={isValidating || !inviteCode.trim()}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: C.paperDark,
                color: C.ink,
                fontSize: 13,
                fontWeight: 700,
                cursor: isValidating || !inviteCode.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: C.line,
              }}
            >
              {isValidating ? <Loader2 size={15} className="animate-spin" /> : "Verify"}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              background: C.rustSoft,
              border: `1px solid ${C.rust}`,
              color: C.rust,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12.5,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div
            style={{
              background: C.tealSoft,
              border: `1px solid ${C.teal}`,
              color: C.teal,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Validated Trip Preview Card */}
        {validatedTrip && (
          <div
            style={{
              background: C.tealSoft,
              border: `1.5px solid ${C.teal}`,
              borderRadius: 12,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={16} color={C.teal} />
                <h4
                  style={{
                    margin: 0,
                    fontFamily: "'Fraunces', serif",
                    fontSize: 16,
                    color: C.ink,
                  }}
                >
                  {validatedTrip.title}
                </h4>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  background: C.teal,
                  color: "#ffffff",
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
              >
                {validatedTrip.currency || "INR"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 12,
                color: C.inkSoft,
                marginTop: 2,
              }}
            >
              {validatedTrip.location && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <MapPin size={12} color={C.rust} />
                  {validatedTrip.location}
                </span>
              )}
              {validatedTrip.startDate && validatedTrip.endDate && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Calendar size={12} color={C.teal} />
                  {formatDate(validatedTrip.startDate)} - {formatDate(validatedTrip.endDate)}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11.5,
                color: C.inkSoft,
                borderTop: `1px dashed ${C.line}`,
                paddingTop: 6,
                marginTop: 4,
              }}
            >
              <Users size={12} />
              <span>
                {validatedTrip.members ? validatedTrip.members.length : (validatedTrip as any).memberCount || 3} members
                currently on this trip
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            id="btn-cancel-join"
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 10,
              border: `1px solid ${C.line}`,
              background: C.card,
              color: C.ink,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            id="btn-confirm-join-trip"
            type="submit"
            disabled={isJoining || isValidating}
            style={{
              flex: 2,
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background: C.teal,
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 800,
              cursor: isJoining || isValidating ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 4px 12px rgba(15, 107, 101, 0.25)",
            }}
          >
            {isJoining ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Joining Trip...
              </>
            ) : validatedTrip ? (
              <>
                <CheckCircle2 size={16} />
                Continue / Join Trip
              </>
            ) : (
              <>
                <ArrowRight size={16} />
                Verify & Join Trip
              </>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
