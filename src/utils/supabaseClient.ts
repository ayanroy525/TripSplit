import { createClient } from "@supabase/supabase-js";
import { Trip, Member, Expense, Payment, Activity, UserAccount } from "../types";

const metaEnv = (import.meta as any).env || {};

const supabaseUrl =
  metaEnv.VITE_SUPABASE_URL ||
  metaEnv.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ryamchjjwoaimwrmurry.supabase.co";

const supabaseAnonKey =
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  metaEnv.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5YW1jaGpqd29haW13cm11cnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTIwOTYsImV4cCI6MjEwNTU4ODA5Nn0.6r-qcinkytxEzCxb4jhRjXNZ0-g4_YTKdsnhUG3De6A";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function mapTripRowToTrip(
  row: any,
  members: Member[] = [],
  expenses: Expense[] = [],
  payments: Payment[] = [],
  activities: Activity[] = []
): Trip {
  return {
    id: row.id,
    title: row.title || "Untitled Trip",
    location: row.location || row.destination || "",
    destination: row.destination || row.location || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    currency: row.currency || "INR",
    status: row.status || "ACTIVE",
    ownerId: row.owner_id || "",
    ownerName: row.owner_name || "",
    memberUserIds: Array.isArray(row.member_user_ids) ? row.member_user_ids : [],
    inviteCode: row.invite_code || `TRIP-${row.id.slice(-6).toUpperCase()}`,
    inviteExpiresAt: row.invite_expires_at || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    completedAt: row.completed_at || undefined,
    completedBy: row.completed_by || undefined,
    members,
    expenses,
    payments,
    activities,
  };
}

export function mapTripToRow(trip: Trip): Record<string, any> {
  const memberUserIds = Array.from(
    new Set([
      trip.ownerId,
      ...(trip.memberUserIds || []),
      ...(trip.members || []).map((m) => m.userId || m.id),
    ].filter(Boolean))
  );

  return {
    id: trip.id,
    title: trip.title || "Untitled Trip",
    location: trip.location || trip.destination || "Destination",
    destination: trip.destination || trip.location || "Destination",
    start_date: trip.startDate || new Date().toISOString().split("T")[0],
    end_date: trip.endDate || new Date().toISOString().split("T")[0],
    currency: trip.currency || "INR",
    status: trip.status || "ACTIVE",
    owner_id: trip.ownerId || "",
    owner_name: trip.ownerName || "Traveler",
    member_user_ids: memberUserIds,
    invite_code: trip.inviteCode || `TRIP-${trip.id.slice(-6).toUpperCase()}`,
    invite_expires_at: trip.inviteExpiresAt || null,
    created_at: trip.createdAt || new Date().toISOString(),
    completed_at: trip.completedAt || null,
    completed_by: trip.completedBy || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapMemberRowToMember(row: any): Member {
  return {
    id: row.id,
    userId: row.user_id || row.id,
    tripId: row.trip_id,
    name: row.name || "Traveler",
    role: row.role || "member",
    avatarColor: row.avatar_color || "#0F6B65",
    phone: row.phone || "",
    email: row.email || "",
    joinedAt: row.joined_at || new Date().toISOString(),
    status: row.status || "active",
  };
}

export function mapMemberToRow(tripId: string, member: Member): Record<string, any> {
  const memId = member.id || member.userId || `m_${Date.now()}`;
  return {
    id: memId,
    trip_id: tripId,
    user_id: member.userId || memId,
    name: member.name || "Member",
    role: member.role || "member",
    avatar_color: member.avatarColor || "#0F6B65",
    phone: member.phone || "",
    email: member.email || "",
    joined_at: member.joinedAt || new Date().toISOString(),
    status: member.status || "active",
  };
}

export function mapExpenseRowToExpense(row: any): Expense {
  return {
    id: row.id,
    expenseId: row.id,
    tripId: row.trip_id,
    title: row.title,
    amount: Number(row.amount) || 0,
    category: row.category || "General",
    date: row.date || "",
    paidBy: row.paid_by || "",
    payers: row.payers || null,
    createdBy: row.created_by || "",
    method: row.method || "equal",
    splitType: row.split_type || row.method || "equal",
    participants: Array.isArray(row.participants) ? row.participants : [],
    splits: typeof row.splits === "object" && row.splits !== null ? row.splits : {},
    splitPercentages: row.split_percentages || null,
    splitShares: row.split_shares || null,
    notes: row.notes || "",
    receiptUrl: row.receipt_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    auditLogs: Array.isArray(row.audit_logs) ? row.audit_logs : [],
  };
}

export function mapExpenseToRow(tripId: string, expense: Expense): Record<string, any> {
  return {
    id: expense.id,
    trip_id: tripId,
    title: expense.title || "Expense",
    amount: Number(expense.amount) || 0,
    category: expense.category || "General",
    date: expense.date || new Date().toISOString().split("T")[0],
    paid_by: expense.paidBy || "",
    payers: expense.payers || null,
    created_by: expense.createdBy || "",
    method: expense.method || "equal",
    split_type: expense.splitType || expense.method || "equal",
    participants: expense.participants || [],
    splits: expense.splits || {},
    split_percentages: expense.splitPercentages || null,
    split_shares: expense.splitShares || null,
    notes: expense.notes || "",
    receipt_url: expense.receiptUrl || "",
    created_at: expense.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted: Boolean(expense.deleted),
    deleted_at: expense.deletedAt || null,
    deleted_by: expense.deletedBy || null,
    audit_logs: expense.auditLogs || [],
  };
}

export function mapPaymentRowToPayment(row: any): Payment {
  return {
    id: row.id,
    settlementId: row.id,
    tripId: row.trip_id,
    from: row.from_member_id || row.from_user_id || "",
    to: row.to_member_id || row.to_user_id || "",
    fromUserId: row.from_user_id || row.from_member_id || "",
    toUserId: row.to_user_id || row.to_member_id || "",
    amount: Number(row.amount) || 0,
    status: row.status || "confirmed",
    method: row.method || "Cash",
    ts: row.ts || "",
    note: row.note || "",
    createdAt: row.created_at,
    paidAt: row.paid_at || null,
    markedPaidBy: row.marked_paid_by || null,
    confirmedBy: row.confirmed_by || null,
    confirmedAt: row.confirmed_at || null,
    cancelledBy: row.cancelled_by || null,
    cancelledAt: row.cancelled_at || null,
    cancellationReason: row.cancellation_reason || null,
    disputedBy: row.disputed_by || null,
    disputedAt: row.disputed_at || null,
    disputeReason: row.dispute_reason || null,
    updatedAt: row.updated_at,
    auditLogs: Array.isArray(row.audit_logs) ? row.audit_logs : [],
  };
}

export function mapPaymentToRow(tripId: string, payment: Payment): Record<string, any> {
  return {
    id: payment.id,
    trip_id: tripId,
    from_member_id: payment.from || payment.fromUserId || "",
    to_member_id: payment.to || payment.toUserId || "",
    from_user_id: payment.fromUserId || payment.from || "",
    to_user_id: payment.toUserId || payment.to || "",
    amount: Number(payment.amount) || 0,
    status: payment.status || "confirmed",
    method: payment.method || "Cash",
    ts: payment.ts || "",
    note: payment.note || "",
    created_at: payment.createdAt || new Date().toISOString(),
    paid_at: payment.paidAt || null,
    marked_paid_by: payment.markedPaidBy || null,
    confirmed_by: payment.confirmedBy || null,
    confirmed_at: payment.confirmedAt || null,
    cancelled_by: payment.cancelledBy || null,
    cancelled_at: payment.cancelledAt || null,
    cancellation_reason: payment.cancellationReason || null,
    disputed_by: payment.disputedBy || null,
    disputed_at: payment.disputedAt || null,
    dispute_reason: payment.disputeReason || null,
    updated_at: new Date().toISOString(),
    audit_logs: payment.auditLogs || [],
  };
}

export function mapActivityRowToActivity(row: any): Activity {
  return {
    id: row.id,
    ts: row.ts || "Just now",
    user: row.user_name || "Someone",
    action: row.action || "",
    detail: row.detail || "",
    actorId: row.actor_id || undefined,
  };
}

export function mapActivityToRow(tripId: string, activity: Activity): Record<string, any> {
  return {
    id: activity.id,
    trip_id: tripId,
    ts: activity.ts || "Just now",
    user_name: activity.user || "Someone",
    action: activity.action || "action",
    detail: activity.detail || "",
    actor_id: activity.actorId || null,
    created_at: new Date().toISOString(),
  };
}

export function mapUserRowToUser(row: any): UserAccount {
  return {
    id: row.id,
    name: row.name || "Traveler",
    email: row.email || "",
    phone: row.phone || "",
    avatarColor: row.avatar_color || "#0F6B65",
    avatarUrl: row.avatar_url || "",
    bio: row.bio || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}
