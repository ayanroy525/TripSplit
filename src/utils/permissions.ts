import { Member, Expense, Trip, Role } from "../types";

export type NormalizedRole = "admin" | "participant" | "viewer";

/**
 * Normalizes any role string (including legacy "owner" or "member") to canonical NormalizedRole.
 */
export function normalizeRole(role?: string | null): NormalizedRole {
  if (!role) return "participant";
  const r = role.toLowerCase().trim();
  if (r === "admin" || r === "owner") return "admin";
  if (r === "viewer") return "viewer";
  return "participant";
}

/**
 * User-facing display label for the role: "Admin", "Participant", or "Viewer".
 */
export function getRoleDisplayName(role?: string | null): "Admin" | "Participant" | "Viewer" {
  const norm = normalizeRole(role);
  if (norm === "admin") return "Admin";
  if (norm === "viewer") return "Viewer";
  return "Participant";
}

/**
 * Resolves the user's effective role in a trip.
 * Trip creator/owner (`trip.ownerId`) is always Admin.
 */
export function getUserRoleInTrip(trip?: Trip | null, userId?: string | null): NormalizedRole {
  if (!trip || !userId) return "viewer";

  // 1. Trip owner/creator is always Trip Admin
  if (trip.ownerId && (trip.ownerId === userId || trip.ownerId.trim().toLowerCase() === userId.trim().toLowerCase())) {
    return "admin";
  }

  // 2. Lookup member record in trip
  const member = trip.members?.find((m) => m.id === userId || m.userId === userId);
  if (member) {
    return normalizeRole(member.role);
  }

  return "viewer";
}

/**
 * Checks whether an expense is owned by the current user (as creator or upfront payer).
 */
export function isExpenseOwnedByUser(
  expense: Expense,
  userId?: string | null,
  trip?: Trip | null
): boolean {
  if (!userId) return false;

  // Direct match on createdBy
  if (expense.createdBy === userId) return true;

  // Direct match on paidBy
  if (expense.paidBy === userId) return true;

  // Multi-payer match
  if (expense.payers && Object.prototype.hasOwnProperty.call(expense.payers, userId)) {
    return true;
  }

  // Check matching trip member records for this user
  if (trip?.members) {
    const userMember = trip.members.find((m) => m.id === userId || m.userId === userId);
    if (userMember) {
      if (expense.createdBy === userMember.id) return true;
      if (expense.paidBy === userMember.id) return true;
      if (expense.payers && Object.prototype.hasOwnProperty.call(expense.payers, userMember.id)) {
        return true;
      }
    }
  }

  return false;
}

export interface TripPermissions {
  role: NormalizedRole;
  displayName: "Admin" | "Participant" | "Viewer";
  isAdmin: boolean;
  isParticipant: boolean;
  isViewer: boolean;

  // Expense Permissions
  canAddExpense: boolean;
  canEditExpense: (expense: Expense) => boolean;
  canDeleteExpense: (expense: Expense) => boolean;

  // Member & Invitation Permissions
  canInviteMember: boolean;
  canRemoveMember: (targetMemberId: string) => boolean;
  canChangeRole: boolean;

  // Trip Settings Permissions
  canManageTripSettings: boolean;
  canDeleteTrip: boolean;

  // Payments & Settlements Permissions
  canRecordPayment: boolean;
  canConfirmPayment: (paymentRecipientId?: string, paymentRecipientUserId?: string) => boolean;
  canCancelPayment: (
    debtorId?: string,
    debtorUserId?: string,
    recipientId?: string,
    recipientUserId?: string
  ) => boolean;
}

/**
 * Computes granular permissions for the active trip and current user.
 */
export function getTripPermissions(
  trip?: Trip | null,
  currentMemberOrUser?: Member | { id: string; role?: Role; userId?: string } | null,
  explicitUserId?: string | null
): TripPermissions {
  const effectiveUserId = explicitUserId || currentMemberOrUser?.userId || currentMemberOrUser?.id || "";

  let role: NormalizedRole = "viewer";

  if (trip?.ownerId && (trip.ownerId === effectiveUserId || trip.ownerId === currentMemberOrUser?.id)) {
    role = "admin";
  } else if (currentMemberOrUser?.role) {
    role = normalizeRole(currentMemberOrUser.role);
  } else if (trip) {
    role = getUserRoleInTrip(trip, effectiveUserId);
  }

  const isAdmin = role === "admin";
  const isParticipant = role === "participant";
  const isViewer = role === "viewer";
  const displayName = getRoleDisplayName(role);

  return {
    role,
    displayName,
    isAdmin,
    isParticipant,
    isViewer,

    // Expense permissions:
    // Admin: can add, edit any, delete any.
    // Participant: can add, edit own, delete own.
    // Viewer: cannot add, cannot edit, cannot delete.
    canAddExpense: isAdmin || isParticipant,
    canEditExpense: (expense: Expense) => {
      if (isAdmin) return true;
      if (isParticipant) return isExpenseOwnedByUser(expense, effectiveUserId, trip);
      return false;
    },
    canDeleteExpense: (expense: Expense) => {
      if (isAdmin) return true;
      if (isParticipant) return isExpenseOwnedByUser(expense, effectiveUserId, trip);
      return false;
    },

    // Member permissions:
    // Admin: can invite, remove members, change roles.
    // Participant: can invite, cannot remove, cannot change roles.
    // Viewer: cannot invite, cannot remove, cannot change roles.
    canInviteMember: isAdmin || isParticipant,
    canRemoveMember: (targetMemberId: string) => {
      if (!isAdmin) return false;
      // Cannot remove the trip owner
      if (trip?.ownerId) {
        const targetMember = trip.members?.find((m) => m.id === targetMemberId);
        if (targetMember && (targetMember.id === trip.ownerId || targetMember.userId === trip.ownerId)) {
          return false;
        }
        if (targetMemberId === trip.ownerId) return false;
      }
      return true;
    },
    canChangeRole: isAdmin,

    // Trip Settings:
    // Admin only
    canManageTripSettings: isAdmin,
    canDeleteTrip: isAdmin,

    // Payments & Settlements:
    // Admin: can record, confirm any, cancel any.
    // Participant: can record, confirm if recipient, cancel if debtor or recipient.
    // Viewer: cannot record, cannot confirm, cannot cancel.
    canRecordPayment: isAdmin || isParticipant,
    canConfirmPayment: (paymentRecipientId?: string, paymentRecipientUserId?: string) => {
      if (isAdmin) return true;
      if (!isParticipant) return false;

      // Check if current user is the recipient
      if (paymentRecipientId && paymentRecipientId === effectiveUserId) return true;
      if (paymentRecipientUserId && paymentRecipientUserId === effectiveUserId) return true;

      // Check if recipient matches current user's trip member ID
      const userMember = trip?.members?.find((m) => m.id === effectiveUserId || m.userId === effectiveUserId);
      if (userMember) {
        if (paymentRecipientId && paymentRecipientId === userMember.id) return true;
        if (paymentRecipientUserId && paymentRecipientUserId === userMember.id) return true;
      }

      return false;
    },
    canCancelPayment: (
      debtorId?: string,
      debtorUserId?: string,
      recipientId?: string,
      recipientUserId?: string
    ) => {
      if (isAdmin) return true;
      if (!isParticipant) return false;

      // Debtor or Creditor can cancel
      const matches = (id?: string) => {
        if (!id) return false;
        if (id === effectiveUserId) return true;
        const userMember = trip?.members?.find((m) => m.id === effectiveUserId || m.userId === effectiveUserId);
        return userMember ? userMember.id === id || userMember.userId === id : false;
      };

      return (
        matches(debtorId) ||
        matches(debtorUserId) ||
        matches(recipientId) ||
        matches(recipientUserId)
      );
    },
  };
}
