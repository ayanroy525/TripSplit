import {
  Trip,
  Expense,
  Payment,
  Member,
  Activity,
  Role,
  SplitMethod,
  ReceiptItem,
  ExpenseAuditLog,
  SettlementStatus,
  PaymentAuditLog,
  TripStatus,
} from "../../types";

export interface DbMemberRow {
  id: string;
  trip_id?: string;
  user_id?: string;
  name?: string;
  role?: Role;
  avatar_color?: string;
  phone?: string | null;
  email?: string | null;
  joined_at?: string;
  status?: Member["status"];
}

export interface DbExpenseRow {
  id: string;
  trip_id?: string;
  title?: string;
  amount?: number | string;
  category?: string;
  date?: string;
  paid_by: string;
  payers?: Record<string, number> | null;
  created_by?: string;
  method?: SplitMethod;
  split_type?: string;
  participants?: string[];
  splits?: Record<string, number>;
  split_percentages?: Record<string, number> | null;
  split_shares?: Record<string, number> | null;
  items?: ReceiptItem[] | null;
  audit_logs?: ExpenseAuditLog[] | null;
  notes?: string | null;
  receipt_url?: string | null;
  original_amount?: number | string | null;
  original_currency?: string | null;
  exchange_rate?: number | string | null;
  created_at?: string;
  updated_at?: string;
  deleted?: boolean;
  deleted_at?: string | null;
}

export interface DbPaymentRow {
  id: string;
  trip_id: string;
  from_member_id: string;
  to_member_id: string;
  from_user_id?: string | null;
  to_user_id?: string | null;
  amount?: number | string;
  status?: SettlementStatus;
  method?: string;
  note?: string | null;
  original_amount?: number | string | null;
  original_currency?: string | null;
  exchange_rate?: number | string | null;
  created_at?: string;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  audit_logs?: PaymentAuditLog[] | null;
}

export interface DbActivityRow {
  id: string;
  trip_id?: string;
  ts?: string;
  user_name?: string;
  action?: string;
  detail?: string;
  actor_id?: string | null;
}

export interface ServerTripPayload {
  id: string;
  title?: string;
  location?: string;
  destination?: string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  currency?: string;
  status?: TripStatus;
  ownerId?: string;
  owner_id?: string;
  ownerName?: string;
  owner_name?: string;
  inviteCode?: string;
  invite_code?: string;
  memberUserIds?: string[];
  member_user_ids?: string[];
  createdAt?: string;
  created_at?: string;
  members?: Array<Member | DbMemberRow>;
  expenses?: Array<Expense | DbExpenseRow>;
  payments?: Array<Payment | DbPaymentRow>;
  activities?: Array<Activity | DbActivityRow>;
}

export function mapTripToRow(trip: Trip, fallbackInviteCode?: string) {
  const memberUserIds = Array.from(
    new Set(
      [
        trip.ownerId,
        ...(trip.memberUserIds || []),
        ...(trip.members || []).map((m) => m.userId || m.id),
      ].filter(Boolean)
    )
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
    invite_code:
      trip.inviteCode ||
      fallbackInviteCode ||
      `TRIP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    updated_at: new Date().toISOString(),
  };
}

export function mapMemberToRow(tripId: string, m: Member) {
  return {
    id: m.id,
    trip_id: tripId,
    user_id: m.userId || m.id,
    name: m.name || "Member",
    role: m.role || "participant",
    avatar_color: m.avatarColor || "#0F6B65",
    phone: m.phone || null,
    email: m.email || null,
    joined_at: m.joinedAt || new Date().toISOString(),
    status: m.status || "active",
  };
}

export function mapRowToMember(row: DbMemberRow): Member {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id || row.id,
    name: row.name || "Member",
    role: row.role || "participant",
    avatarColor: row.avatar_color || "#0F6B65",
    phone: row.phone || undefined,
    email: row.email || undefined,
    joinedAt: row.joined_at || new Date().toISOString(),
    status: row.status || "active",
  };
}

export function mapExpenseToRow(tripId: string, e: Expense) {
  return {
    id: e.id,
    trip_id: tripId,
    title: e.title || "Expense",
    amount: Number(e.amount) || 0,
    category: e.category || "General",
    date: e.date || new Date().toISOString().split("T")[0],
    paid_by: e.paidBy,
    payers: e.payers || null,
    created_by: e.createdBy || e.paidBy,
    method: e.method || "equal",
    split_type: e.splitType || e.method || "equal",
    participants: Array.isArray(e.participants) ? e.participants : [],
    splits: e.splits || {},
    split_percentages: e.splitPercentages || null,
    split_shares: e.splitShares || null,
    items: e.items || null,
    audit_logs: e.auditLogs || [],
    notes: e.notes || null,
    receipt_url: e.receiptUrl || null,
    original_amount: e.originalAmount ?? null,
    original_currency: e.currency ?? null,
    exchange_rate: e.exchangeRate ?? null,
    deleted: Boolean(e.deleted),
    deleted_at: e.deletedAt || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapRowToExpense(row: DbExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title || "Expense",
    amount: Number(row.amount) || 0,
    category: row.category || "General",
    date: row.date || new Date().toISOString().split("T")[0],
    paidBy: row.paid_by,
    payers: row.payers || undefined,
    createdBy: row.created_by || row.paid_by,
    method: row.method || "equal",
    splitType: row.split_type || row.method || "equal",
    participants: Array.isArray(row.participants) ? row.participants : [],
    splits: row.splits || {},
    splitPercentages: row.split_percentages || undefined,
    splitShares: row.split_shares || undefined,
    items: Array.isArray(row.items) ? row.items : undefined,
    auditLogs: Array.isArray(row.audit_logs) ? row.audit_logs : undefined,
    notes: row.notes || undefined,
    receiptUrl: row.receipt_url || undefined,
    originalAmount: row.original_amount != null ? Number(row.original_amount) : undefined,
    currency: row.original_currency || undefined,
    exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at || undefined,
  };
}

export function mapPaymentToRow(tripId: string, p: Payment) {
  return {
    id: p.id,
    trip_id: tripId,
    from_member_id: p.from,
    to_member_id: p.to,
    from_user_id: p.fromUserId || p.from,
    to_user_id: p.toUserId || p.to,
    amount: Number(p.amount) || 0,
    status: p.status || "confirmed",
    method: p.method || "Cash",
    note: p.note || null,
    original_amount: p.originalAmount ?? null,
    original_currency: p.currency ?? null,
    exchange_rate: p.exchangeRate ?? null,
    confirmed_by: p.confirmedBy || null,
    confirmed_at: p.confirmedAt || null,
    cancelled_by: p.cancelledBy || null,
    cancelled_at: p.cancelledAt || null,
    audit_logs: p.auditLogs || [],
    updated_at: new Date().toISOString(),
  };
}

export function mapRowToPayment(row: DbPaymentRow): Payment {
  return {
    id: row.id,
    settlementId: row.id,
    tripId: row.trip_id,
    from: row.from_member_id,
    to: row.to_member_id,
    fromUserId: row.from_user_id || row.from_member_id,
    toUserId: row.to_user_id || row.to_member_id,
    amount: Number(row.amount) || 0,
    status: row.status || "confirmed",
    method: row.method || "Cash",
    ts: row.created_at ? new Date(row.created_at).toLocaleDateString() : "Just now",
    note: row.note || undefined,
    originalAmount: row.original_amount != null ? Number(row.original_amount) : undefined,
    currency: row.original_currency || undefined,
    exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : undefined,
    createdAt: row.created_at || new Date().toISOString(),
    confirmedAt: row.confirmed_at || undefined,
    confirmedBy: row.confirmed_by || undefined,
    cancelledAt: row.cancelled_at || undefined,
    cancelledBy: row.cancelled_by || undefined,
    auditLogs: Array.isArray(row.audit_logs) ? row.audit_logs : undefined,
  };
}

export function mapActivityToRow(tripId: string, a: Activity) {
  return {
    id: a.id,
    trip_id: tripId,
    ts: a.ts || "Just now",
    user_name: a.user || "Traveler",
    action: a.action || "",
    detail: a.detail || "",
    actor_id: a.actorId || null,
  };
}

export function mapRowToActivity(row: DbActivityRow): Activity {
  return {
    id: row.id,
    ts: row.ts || "Just now",
    user: row.user_name || "Traveler",
    action: row.action || "",
    detail: row.detail || "",
    actorId: row.actor_id || undefined,
  };
}

function isDbMemberRow(m: Member | DbMemberRow): m is DbMemberRow {
  return "trip_id" in m || "user_id" in m || "avatar_color" in m;
}

function isDbExpenseRow(e: Expense | DbExpenseRow): e is DbExpenseRow {
  return "trip_id" in e || "paid_by" in e || "split_type" in e;
}

function isDbPaymentRow(p: Payment | DbPaymentRow): p is DbPaymentRow {
  return "trip_id" in p || "from_member_id" in p || "to_member_id" in p;
}

function isDbActivityRow(a: Activity | DbActivityRow): a is DbActivityRow {
  return "trip_id" in a || "user_name" in a;
}

export function mapServerTripToClientTrip(rawTrip: ServerTripPayload): Trip {
  const tripId = rawTrip.id;
  const members: Member[] = Array.isArray(rawTrip.members)
    ? rawTrip.members.map((m) => (isDbMemberRow(m) ? mapRowToMember(m) : m))
    : [];
  const expenses: Expense[] = Array.isArray(rawTrip.expenses)
    ? rawTrip.expenses.map((e) => (isDbExpenseRow(e) ? mapRowToExpense(e) : e))
    : [];
  const payments: Payment[] = Array.isArray(rawTrip.payments)
    ? rawTrip.payments.map((p) => (isDbPaymentRow(p) ? mapRowToPayment(p) : p))
    : [];
  const activities: Activity[] = Array.isArray(rawTrip.activities)
    ? rawTrip.activities.map((a) => (isDbActivityRow(a) ? mapRowToActivity(a) : a))
    : [];

  const memberUserIds = Array.from(
    new Set(
      [
        rawTrip.ownerId || rawTrip.owner_id,
        ...(Array.isArray(rawTrip.memberUserIds)
          ? rawTrip.memberUserIds
          : Array.isArray(rawTrip.member_user_ids)
          ? rawTrip.member_user_ids
          : []),
        ...members.map((m) => m.userId || m.id),
      ].filter((id): id is string => Boolean(id))
    )
  );

  return {
    id: tripId,
    title: rawTrip.title || "Untitled Trip",
    location: rawTrip.location || rawTrip.destination || "Destination",
    destination: rawTrip.destination || rawTrip.location || "Destination",
    startDate: rawTrip.startDate || rawTrip.start_date || new Date().toISOString().split("T")[0],
    endDate: rawTrip.endDate || rawTrip.end_date || new Date().toISOString().split("T")[0],
    currency: rawTrip.currency || "INR",
    status: rawTrip.status || "ACTIVE",
    ownerId: rawTrip.ownerId || rawTrip.owner_id || "",
    ownerName: rawTrip.ownerName || rawTrip.owner_name || "Traveler",
    inviteCode: rawTrip.inviteCode || rawTrip.invite_code || "",
    memberUserIds,
    createdAt: rawTrip.createdAt || rawTrip.created_at || new Date().toISOString(),
    members,
    expenses,
    payments,
    activities,
  };
}

export function isUserAuthorizedForTrip(trip: Trip, userId: string): boolean {
  if (!trip || !userId) return false;
  if (trip.ownerId === userId) return true;
  if (Array.isArray(trip.memberUserIds) && trip.memberUserIds.includes(userId)) return true;
  if (Array.isArray(trip.members) && trip.members.some((m) => m.id === userId || m.userId === userId)) return true;
  return false;
}

export function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

export function isPhoneMatch(phoneA?: string | null, phoneB?: string | null): boolean {
  const cleanA = normalizePhone(phoneA);
  const cleanB = normalizePhone(phoneB);
  if (cleanA.length < 7 || cleanB.length < 7) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.length >= 10 && cleanB.length >= 10) {
    return cleanA.slice(-10) === cleanB.slice(-10);
  }
  return false;
}

export function isEmailMatch(emailA?: string | null, emailB?: string | null): boolean {
  if (!emailA || !emailB) return false;
  const cleanA = emailA.trim().toLowerCase();
  const cleanB = emailB.trim().toLowerCase();
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB;
}

export function normalizeInviteInput(rawInput: string): string {
  let clean = (rawInput || "").trim();
  if (!clean) return "";

  if (clean.includes("code=")) {
    const match = clean.match(/code=([^&?#]+)/i);
    if (match && match[1]) {
      clean = decodeURIComponent(match[1]);
    }
  } else if (clean.includes("join=")) {
    const match = clean.match(/join=([^&?#]+)/i);
    if (match && match[1]) {
      clean = decodeURIComponent(match[1]);
    }
  } else if (clean.startsWith("#join?")) {
    clean = clean.replace("#join?", "");
  }

  return clean.trim().toUpperCase();
}
