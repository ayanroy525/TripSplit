export type Role = "owner" | "member" | "viewer";

export interface TripMember {
  id: string;
  userId?: string;
  tripId?: string;
  name: string;
  role: Role;
  avatarColor: string;
  phone?: string;
  email?: string;
  joinedAt?: string;
  status?: "active" | "invited" | "left";
}

export type Member = TripMember;

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
  password?: string;
  createdAt: string;
}

export type SplitMethod = "equal" | "custom" | "percentage" | "shares" | "selected";

export interface ExpenseAuditLog {
  id: string;
  action: "created" | "updated" | "deleted";
  actorId: string;
  actorName: string;
  timestamp: string;
  details: string;
}

export interface Expense {
  id: string;
  expenseId?: string;
  tripId?: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  paidBy: string; // single payer member ID, or "multiple"
  payers?: Record<string, number>; // memberId -> amount paid (for multi-payer support)
  createdBy: string;
  method: SplitMethod;
  splitType?: string;
  participants: string[];
  splits: Record<string, number>; // memberId -> exact share in currency
  splitPercentages?: Record<string, number>; // memberId -> %
  splitShares?: Record<string, number>; // memberId -> integer share weight
  notes?: string;
  receiptUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deleted?: boolean;
  auditLogs?: ExpenseAuditLog[];
}

export type SettlementStatus =
  | "pending_confirmation"
  | "confirmed"
  | "PAID"
  | "PENDING"
  | "CANCELLED"
  | "cancelled"
  | "DISPUTED"
  | "disputed";

export type PaymentStatus = SettlementStatus;

export interface PaymentAuditLog {
  id: string;
  action: "created" | "confirmed" | "cancelled" | "disputed";
  actorId: string;
  actorName: string;
  timestamp: string;
  previousStatus?: string;
  newStatus: string;
  details: string;
  reason?: string;
}

export interface Settlement {
  id: string;
  settlementId?: string;
  tripId: string;
  from: string; // from memberId (Debtor / Payer)
  to: string; // to memberId (Creditor / Receiver)
  fromUserId?: string;
  toUserId?: string;
  amount: number;
  status: SettlementStatus;
  method?: "Cash" | "Bank Transfer" | "UPI" | "Other" | string;
  ts?: string;
  note?: string;
  createdAt: string;
  paidAt?: string;
  markedPaidBy?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  disputedBy?: string;
  disputedAt?: string;
  disputeReason?: string;
  updatedAt?: string;
  auditLogs?: PaymentAuditLog[];
}

export type Payment = Settlement;

export interface SimplifiedDebt {
  id: string;
  from: string; // Debtor member ID
  to: string; // Creditor member ID
  amount: number;
}

export type Debt = SimplifiedDebt;

export type TripStatus = "ACTIVE" | "COMPLETED";

export interface Activity {
  id: string;
  ts: string;
  user: string;
  action: string;
  detail: string;
  actorId?: string;
}

export interface Trip {
  id: string;
  title: string;
  location: string;
  destination?: string;
  startDate: string;
  endDate: string;
  currency: string;
  status?: TripStatus;
  ownerId?: string;
  ownerName?: string;
  memberUserIds?: string[];
  inviteCode?: string;
  inviteExpiresAt?: string;
  members: Member[];
  expenses: Expense[];
  payments: Payment[];
  activities: Activity[];
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
}

export type NavTab =
  | "home"
  | "expenses"
  | "settlement"
  | "balances"
  | "settlements"
  | "analytics"
  | "people"
  | "members"
  | "activity";

export interface ExpenseFilters {
  searchQuery: string;
  category: string;
  paidBy: string;
  participant: string;
  dateRange: "all" | "today" | "yesterday" | "this_week" | "custom";
  sortBy: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
  splitMethod?: string;
}

export interface StorageSchema {
  version: number;
  lastUpdated: string;
  trips: Trip[];
  activeTripId: string | null;
  authUser: UserAccount | null;
  currentUserId: string;
}

export interface SecurityTestCaseResult {
  id: number;
  name: string;
  description: string;
  expectedStatus: string;
  actualStatus: string;
  passed: boolean;
  details: string;
  responsePayload?: any;
}

export interface SecurityTestReport {
  timestamp: string;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  allPassed: boolean;
  results: SecurityTestCaseResult[];
}

export type NotificationType =
  | "expense_added"
  | "expense_updated"
  | "expense_deleted"
  | "settlement_requested"
  | "settlement_confirmed"
  | "settlement_cancelled"
  | "payment_recorded"
  | "payment_confirmed"
  | "debt_reminder"
  | "member_joined"
  | "member_added"
  | "member_updated"
  | "trip_completed"
  | "trip_updated"
  | "system";

export interface AppNotification {
  id: string;
  tripId: string;
  tripTitle: string;
  type: NotificationType;
  title: string;
  body: string;
  actorName: string;
  actorAvatarColor?: string;
  amount?: number;
  currency?: string;
  relatedId?: string;
  targetTab?: NavTab;
  read: boolean;
  timestamp: string;
}

export interface NotificationPreferences {
  browserPush: boolean;
  inAppToasts: boolean;
  soundEnabled: boolean;
  notifyOnExpense: boolean;
  notifyOnSettlement: boolean;
  notifyOnMember: boolean;
  notifyOnReminder?: boolean;
  notifyOnCompletion: boolean;
}

export interface WhatsAppNotificationPayload {
  title: string;
  subtitle?: string;
  messageText: string;
  targetPhone?: string;
  targetMemberIds?: string[];
  eventType:
    | "add"
    | "edit"
    | "delete"
    | "settle"
    | "invite"
    | "manual"
    | "debt_reminder"
    | "balance_summary"
    | "reminder"
    | "expense"
    | "settlement";
  individualMessages?: Record<string, string>;
  expense?: Expense;
  trip?: Trip;
  creatorName?: string;
}
