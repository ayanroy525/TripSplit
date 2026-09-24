import React, { useState, useMemo, useEffect } from "react";
import {
  Plus,
  Receipt,
  Scale,
  PieChart as PieIcon,
  Users,
  RotateCcw,
  Sparkles,
  MapPin,
  ChevronDown,
  MoreVertical,
  Banknote,
  Compass,
  ArrowRight,
  Shield,
  Activity as ActivityIcon,
} from "lucide-react";
import confetti from "canvas-confetti";
import {
  Trip,
  Member,
  Expense,
  Payment,
  SimplifiedDebt,
  NavTab,
} from "./types";
import {
  money,
  nowStr,
  uid,
  computeBalances,
  simplifyDebts,
} from "./utils/calculations";
import {
  loadStateFromStorage,
  saveStateToStorage,
  loadUserLocalState,
  saveUserLocalState,
  isUserAuthorizedForTrip,
  resetStorageState,
  subscribeToUserTrips,
  subscribeToAllTrips,
  saveTripToDatabase,
  deleteTripFromDatabase,
  addExpenseToDatabase,
  updateExpenseInDatabase,
  deleteExpenseFromDatabase,
  addPaymentToDatabase,
  updatePaymentInDatabase,
  addMemberToDatabase,
  updateMemberInDatabase,
  deleteMemberFromDatabase,
  addActivityToDatabase,
  DEFAULT_AUTH_USER,
} from "./utils/storage";
import { C } from "./utils/constants";
import { Avatar } from "./components/Atoms";
import { HomeDashboardView } from "./components/HomeDashboardView";
import { ExpensesListView } from "./components/ExpensesListView";
import { BalanceView } from "./components/BalanceView";
import { AnalyticsView } from "./components/AnalyticsView";
import { PeopleView } from "./components/PeopleView";
import { ActivityLogView } from "./components/ActivityLogView";
import { BottomNavigation } from "./components/BottomNavigation";
import { NotificationBell } from "./components/NotificationBell";
import { NotificationCenterModal } from "./components/NotificationCenterModal";
import { NotificationToastContainer } from "./components/NotificationToastContainer";
import { ExpenseFormModal } from "./components/ExpenseFormModal";
import { SettleUpModal } from "./components/SettleUpModal";
import { MemberManagementModal } from "./components/MemberManagementModal";
import { InviteMembersModal } from "./components/InviteMembersModal";
import { ResetTripModal } from "./components/ResetTripModal";
import { TripsHubModal } from "./components/TripsHubModal";
import { ShareExportModal } from "./components/ShareExportModal";
import { TripMoreMenuModal } from "./components/TripMoreMenuModal";
import { UserProfileModal } from "./components/UserProfileModal";
import { WhatsAppNotificationModal } from "./components/WhatsAppNotificationModal";
import { LoginPage } from "./components/LoginPage";
import { EmptyTripStateView } from "./components/EmptyTripStateView";
import { JoinTripModal } from "./components/JoinTripModal";
import { ResetPasswordModal } from "./components/ResetPasswordModal";
import { useAuth } from "./context/AuthContext";
import { useNotifications } from "./context/NotificationContext";

export default function App() {
  const [isHydrated, setIsHydrated] = useState(false);
  const {
    currentUser: authUser,
    accounts: allUsers,
    updateProfile: updateAuthUser,
    logout,
  } = useAuth();
  const { notify } = useNotifications();

  // Core Trip State
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>(() => authUser?.id || "");

  // Keep currentUserId in sync with authUser.id
  useEffect(() => {
    const activeUid = authUser?.id;
    if (activeUid && activeUid !== currentUserId) {
      setCurrentUserId(activeUid);
    }
  }, [authUser?.id]);

  // Navigation tab state: "home" | "expenses" | "settlement" | "analytics" | "people" | "activity"
  const [activeTab, setActiveTab] = useState<"home" | "expenses" | "settlement" | "analytics" | "people" | "activity">("home");

  // Modal dialog states
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settlePreselect, setSettlePreselect] = useState<{ debtorId?: string; creditorId?: string; amount?: number }>({});
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isTripsHubModalOpen, setIsTripsHubModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppPayload, setWhatsAppPayload] = useState<any>(null);
  const [isJoinTripModalOpen, setIsJoinTripModalOpen] = useState(false);
  const [initialJoinCode, setInitialJoinCode] = useState("");

  // 1. HYDRATION & REAL-TIME SUPABASE REALTIME LISTENER (STRICT USER ISOLATION)
  useEffect(() => {
    let isMounted = true;
    const effectiveUid = authUser?.id;

    if (!effectiveUid || !authUser) {
      setTrips([]);
      setActiveTripId("");
      setIsHydrated(true);
      return;
    }

    // Load user-namespaced local cache with strict authorization check
    const loaded = loadUserLocalState(effectiveUid);
    if (loaded.trips && loaded.trips.length > 0) {
      setTrips(loaded.trips);
      setActiveTripId(loaded.activeTripId || loaded.trips[0].id);
    } else {
      setTrips([]);
      setActiveTripId("");
    }

    // Parse URL deep links & invite links
    const handleUrlRouting = (currentAuthorizedTrips: Trip[]) => {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      const pathname = window.location.pathname || "";

      // A. Invite Links: #join?code=..., #join?tripId=..., ?code=..., ?join=...
      let detectedInviteCode = "";
      if (hash.includes("join?")) {
        const params = new URLSearchParams(hash.split("join?")[1]);
        detectedInviteCode = params.get("code") || "";
        const tripIdParam = params.get("tripId");
        if (!detectedInviteCode && tripIdParam) {
          detectedInviteCode = `TRIP-${tripIdParam.slice(-6).toUpperCase()}`;
        }
      } else if (search.includes("code=") || search.includes("join=")) {
        const params = new URLSearchParams(search);
        detectedInviteCode = params.get("code") || params.get("join") || "";
      }

      if (detectedInviteCode) {
        setInitialJoinCode(detectedInviteCode.toUpperCase());
        setIsJoinTripModalOpen(true);
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      // B. Trip Deep Links: #/trip/<id>, /trip/<id>, or ?tripId=<id>
      let requestedTripId = "";
      if (hash.startsWith("#/trip/") || hash.startsWith("#trip/")) {
        requestedTripId = hash.replace(/^#\/?trip\//, "").split("?")[0].trim();
      } else if (pathname.startsWith("/trip/")) {
        requestedTripId = pathname.replace(/^\/trip\//, "").split("?")[0].trim();
      } else if (search.includes("tripId=")) {
        const params = new URLSearchParams(search);
        requestedTripId = params.get("tripId") || "";
      }

      if (requestedTripId) {
        const isAuthorized = currentAuthorizedTrips.some((t) => t.id === requestedTripId);
        if (isAuthorized) {
          setActiveTripId(requestedTripId);
        } else if (currentAuthorizedTrips.length > 0) {
          // Clean unauthorized parameter from URL and inform user
          window.history.replaceState(null, "", window.location.pathname);
          notify({
            tripId: "system",
            tripTitle: "Trip Access",
            type: "system",
            title: "Trip Not Accessible",
            body: "You do not have access to this trip or it does not exist.",
            actorName: "System",
            actorAvatarColor: "#F59E0B",
          });
          setActiveTripId(currentAuthorizedTrips[0].id);
        }
      }
    };

    // Real-time Supabase listener for trips belonging ONLY to the authenticated user
    const unsubscribeTrips = subscribeToUserTrips(
      effectiveUid,
      (userTrips) => {
        if (!isMounted) return;
        setTrips(userTrips);
        
        setActiveTripId((prev) => {
          if (prev && userTrips.some((t) => t.id === prev)) {
            return prev;
          }
          return userTrips.length > 0 ? userTrips[0].id : "";
        });

        handleUrlRouting(userTrips);
        setIsHydrated(true);
      },
      (err) => {
        console.warn("Database real-time subscription error:", err);
        if (isMounted) setIsHydrated(true);
      }
    );

    // Also listen to hashchange / popstate for browser navigation
    const onHashChange = () => {
      handleUrlRouting(trips);
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);

    return () => {
      isMounted = false;
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
      unsubscribeTrips();
    };
  }, [authUser?.id]);

  // Read-only backup snapshot in user-namespaced localStorage
  useEffect(() => {
    const effectiveUid = authUser?.id;
    if (!isHydrated || !effectiveUid) return;

    saveUserLocalState(effectiveUid, {
      trips,
      activeTripId,
    });
  }, [trips, activeTripId, currentUserId, authUser?.id, isHydrated]);

  // Active user's trips filter with strict authorization
  const userTrips = useMemo(() => {
    const effectiveUid = authUser?.id || currentUserId;
    if (!effectiveUid) return [];
    return trips.filter((t) => isUserAuthorizedForTrip(t, effectiveUid));
  }, [trips, authUser?.id, currentUserId]);

  // Active Trip resolution
  const trip = useMemo(() => {
    if (userTrips.length === 0) return null;
    const found = userTrips.find((t) => t.id === activeTripId);
    return found || userTrips[0] || null;
  }, [userTrips, activeTripId]);

  // Helper to update active trip locally
  const updateActiveTrip = (updatedTrip: Trip) => {
    setTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
  };

  // Current active member representation (NEVER fall back to another user's identity)
  const currentUser: Member = useMemo(() => {
    const effectiveUid = authUser?.id || currentUserId || "user_guest";
    const effectiveName = authUser?.name || "Traveler";
    const effectiveColor = authUser?.avatarColor || "#0F6B65";
    const effectivePhone = authUser?.phone || "";

    if (trip && trip.members && trip.members.length > 0) {
      const match = trip.members.find(
        (m) =>
          m.id === effectiveUid ||
          m.userId === effectiveUid ||
          (authUser?.id && (m.id === authUser.id || m.userId === authUser.id))
      );
      if (match) return match;
    }

    return {
      id: effectiveUid,
      userId: effectiveUid,
      name: effectiveName,
      role: trip?.ownerId === effectiveUid ? ("owner" as const) : ("member" as const),
      avatarColor: effectiveColor,
      phone: effectivePhone,
      joinedAt: new Date().toISOString(),
      status: "active" as const,
    };
  }, [trip, currentUserId, authUser]);

  // FINANCIAL ENGINE CALCULATIONS
  const activeExpenses = useMemo(
    () => (trip?.expenses || []).filter((e) => !e.deleted),
    [trip?.expenses]
  );
  
  const totalTripSpent = useMemo(
    () => activeExpenses.reduce((s, e) => s + e.amount, 0),
    [activeExpenses]
  );

  // Compute individual balances (Paid, Share) and final Net
  const { paidShare, net: netBalances } = useMemo(() => {
    if (!trip) return { paidShare: {}, net: {} };
    return computeBalances(trip.members || [], trip.expenses || [], trip.payments || []);
  }, [trip]);

  // Simplified debts (greedy Min-Cash-Flow)
  const simplifiedDebts: SimplifiedDebt[] = useMemo(() => {
    return simplifyDebts(netBalances);
  }, [netBalances]);

  // User Stats
  const userStats = useMemo(() => {
    const ps = paidShare[currentUser.id] || { paid: 0, share: 0 };
    return {
      paid: ps.paid,
      share: ps.share,
      net: netBalances[currentUser.id] || 0,
    };
  }, [paidShare, netBalances, currentUser.id]);

  // Member stats object for PeopleView
  const memberStatsObj = useMemo(() => {
    const res: Record<string, { paid: number; share: number; net: number }> = {};
    (trip?.members || []).forEach((m) => {
      const ps = paidShare[m.id] || { paid: 0, share: 0 };
      res[m.id] = {
        paid: ps.paid,
        share: ps.share,
        net: netBalances[m.id] || 0,
      };
    });
    return res;
  }, [trip?.members, paidShare, netBalances]);

  // Confetti helper
  const triggerConfetti = () => {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
      colors: ["#2DD4BF", "#E39A2D", "#8B5CF6", "#4ADE80"],
    });
  };

  // EXPENSE HANDLERS: FIRESTORE PRIMARY WRITE PATH
  const handleSaveExpense = async (savedExpense: Expense) => {
    if (!trip) return;
    const isEdit = trip.expenses.some((e) => e.id === savedExpense.id);

    try {
      const expenseToSave: Expense = {
        ...savedExpense,
        id: savedExpense.id || uid("exp"),
        tripId: trip.id,
        updatedAt: new Date().toISOString(),
        createdAt: savedExpense.createdAt || new Date().toISOString(),
      };

      const actionText = isEdit
        ? `updated "${expenseToSave.title}" — ${money(expenseToSave.amount, trip.currency)}`
        : `added "${expenseToSave.title}" — ${money(expenseToSave.amount, trip.currency)}`;

      const newActivity = {
        id: uid("act"),
        ts: nowStr(),
        user: currentUser.name,
        action: isEdit ? "updated" : "added",
        detail: actionText,
        actorId: currentUser.id,
      };

      // Awaited database operations: primary and authoritative write path
      if (isEdit) {
        await updateExpenseInDatabase(trip.id, expenseToSave);
      } else {
        await addExpenseToDatabase(trip.id, expenseToSave);
      }
      await addActivityToDatabase(trip.id, newActivity);

      const updatedExpenses = isEdit
        ? trip.expenses.map((e) => (e.id === expenseToSave.id ? expenseToSave : e))
        : [expenseToSave, ...trip.expenses];

      const updatedTripObj: Trip = {
        ...trip,
        expenses: updatedExpenses,
        activities: [newActivity, ...(trip.activities || [])],
      };
      updateActiveTrip(updatedTripObj);

      notify({
        tripId: trip.id,
        tripTitle: trip.title,
        type: isEdit ? "expense_updated" : "expense_added",
        title: isEdit ? "Expense Updated" : "New Expense Logged",
        body: `${currentUser.name} ${actionText}`,
        actorName: currentUser.name,
        actorAvatarColor: currentUser.avatarColor,
        amount: expenseToSave.amount,
        currency: trip.currency,
        targetTab: "expenses",
      });

      setIsExpenseModalOpen(false);
      setEditingExpense(null);
      triggerConfetti();
    } catch (err: any) {
      console.error("Failed to save expense to Database:", err);
      alert(err?.message || "Failed to save expense. Please check your network connection and try again.");
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!trip) return;
    const exp = trip.expenses.find((e) => e.id === expenseId);
    if (!exp) return;

    try {
      const newActivity = {
        id: uid("act"),
        ts: nowStr(),
        user: currentUser.name,
        action: "deleted",
        detail: `deleted "${exp.title}"`,
        actorId: currentUser.id,
      };

      // Awaited database operations
      await deleteExpenseFromDatabase(trip.id, expenseId);
      await addActivityToDatabase(trip.id, newActivity);

      const updatedExpenses = trip.expenses.filter((e) => e.id !== expenseId);
      const updatedTripObj: Trip = {
        ...trip,
        expenses: updatedExpenses,
        activities: [newActivity, ...(trip.activities || [])],
      };
      updateActiveTrip(updatedTripObj);
    } catch (err: any) {
      console.error("Failed to delete expense from Database:", err);
      alert(err?.message || "Failed to delete expense. Please try again.");
    }
  };

  // SETTLEMENT HANDLERS: DATABASE PRIMARY WRITE PATH
  const handleRecordPayment = async (payment: Payment) => {
    if (!trip) return;

    try {
      const authoritativePayment: Payment = {
        ...payment,
        id: payment.id || uid("pay"),
        tripId: trip.id,
        from: payment.from || payment.fromUserId || "",
        to: payment.to || payment.toUserId || "",
        fromUserId: payment.fromUserId || payment.from || "",
        toUserId: payment.toUserId || payment.to || "",
        amount: payment.amount,
        method: payment.method || "Cash",
        note: payment.note || "",
        status: payment.status || "confirmed",
        ts: payment.ts || nowStr(),
        createdAt: payment.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const debtor = trip.members.find((m) => m.id === authoritativePayment.from)?.name || authoritativePayment.from;
      const creditor = trip.members.find((m) => m.id === authoritativePayment.to)?.name || authoritativePayment.to;
      const isConfirmed = authoritativePayment.status === "confirmed" || authoritativePayment.status === "PAID";

      const newActivity = {
        id: uid("act"),
        ts: nowStr(),
        user: currentUser.name,
        action: isConfirmed ? "confirmed manual payment" : "recorded manual payment",
        detail: isConfirmed
          ? `${debtor} paid ${creditor} — ${money(authoritativePayment.amount, trip.currency)} (Confirmed)`
          : `${debtor} recorded manual payment of ${money(authoritativePayment.amount, trip.currency)} to ${creditor} (Waiting for confirmation)`,
        actorId: currentUser.id,
      };

      // Awaited database operations
      await addPaymentToDatabase(trip.id, authoritativePayment);
      await addActivityToDatabase(trip.id, newActivity);

      const updatedPayments = [authoritativePayment, ...(trip.payments || []).filter(p => p.id !== authoritativePayment.id)];
      const updatedTripObj: Trip = {
        ...trip,
        payments: updatedPayments,
        activities: [newActivity, ...(trip.activities || [])],
      };
      updateActiveTrip(updatedTripObj);

      notify({
        tripId: trip.id,
        tripTitle: trip.title,
        type: "payment_recorded",
        title: isConfirmed ? "Manual Settlement Confirmed" : "Manual Payment Recorded",
        body: isConfirmed
          ? `${creditor} confirmed manual payment of ${money(authoritativePayment.amount, trip.currency)} from ${debtor}.`
          : `${debtor} recorded a manual payment of ${money(authoritativePayment.amount, trip.currency)} to ${creditor}. Waiting for confirmation.`,
        actorName: currentUser.name,
        actorAvatarColor: currentUser.avatarColor,
        amount: authoritativePayment.amount,
        currency: trip.currency,
        targetTab: "settlement",
      });

      setIsSettleModalOpen(false);
      triggerConfetti();
    } catch (err: any) {
      console.error("Failed to record payment in Database:", err);
      alert(err?.message || "Failed to record payment. Please try again.");
    }
  };

  const handleConfirmPayment = async (paymentId: string) => {
    if (!trip) return;
    try {
      const existing = trip.payments?.find((p) => p.id === paymentId);
      if (!existing) return;

      const updatedPayment: Payment = {
        ...existing,
        id: paymentId,
        status: "confirmed",
        confirmedBy: currentUser.id,
        confirmedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Awaited database operation
      await updatePaymentInDatabase(trip.id, updatedPayment);

      const updatedPayments = (trip.payments || []).map((p) =>
        p.id === paymentId ? updatedPayment : p
      );
      const updatedTripObj = { ...trip, payments: updatedPayments };
      updateActiveTrip(updatedTripObj);

      const debtor = trip.members.find((m) => m.id === updatedPayment.from)?.name || "Payer";
      const creditor = trip.members.find((m) => m.id === updatedPayment.to)?.name || "Receiver";

      notify({
        tripId: trip.id,
        tripTitle: trip.title,
        type: "payment_confirmed",
        title: "Manual Payment Confirmed",
        body: `${creditor} confirmed the manual payment of ${money(updatedPayment.amount, trip.currency)} from ${debtor}.`,
        actorName: currentUser.name,
        actorAvatarColor: currentUser.avatarColor,
        amount: updatedPayment.amount,
        currency: trip.currency,
        targetTab: "settlement",
      });
    } catch (err: any) {
      console.error("Failed to confirm payment in Database:", err);
      alert(err?.message || "Failed to confirm payment. Please try again.");
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    if (!trip) return;
    try {
      const existing = trip.payments?.find((p) => p.id === paymentId);
      if (!existing) return;

      const updatedPayment: Payment = {
        ...existing,
        id: paymentId,
        status: "cancelled",
        cancelledBy: currentUser.id,
        cancelledAt: new Date().toISOString(),
        cancellationReason: "Cancelled by user",
        updatedAt: new Date().toISOString(),
      };

      // Awaited database operation
      await updatePaymentInDatabase(trip.id, updatedPayment);

      const updatedPayments = (trip.payments || []).map((p) =>
        p.id === paymentId ? updatedPayment : p
      );
      const updatedTripObj = { ...trip, payments: updatedPayments };
      updateActiveTrip(updatedTripObj);
    } catch (err: any) {
      console.error("Failed to cancel payment in Database:", err);
      alert(err?.message || "Failed to cancel payment. Please try again.");
    }
  };

  // MEMBER HANDLERS: DATABASE PRIMARY WRITE PATH
  const handleSaveMember = async (member: Member) => {
    if (!trip) return;
    try {
      const isEdit = trip.members.some((m) => m.id === member.id);

      // Awaited database operation
      if (isEdit) {
        await updateMemberInDatabase(trip.id, member);
      } else {
        await addMemberToDatabase(trip.id, member);
      }

      const updatedMembers = isEdit
        ? trip.members.map((m) => (m.id === member.id ? member : m))
        : [...trip.members, member];

      const updatedTripObj = { ...trip, members: updatedMembers };
      updateActiveTrip(updatedTripObj);

      setIsMembersModalOpen(false);
      setEditingMember(null);
    } catch (err: any) {
      console.error("Failed to save member in Database:", err);
      alert(err?.message || "Failed to save member. Please try again.");
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!trip) return;
    try {
      // Awaited database operation
      await deleteMemberFromDatabase(trip.id, memberId);

      const updatedMembers = trip.members.filter((m) => m.id !== memberId);
      const updatedTripObj = { ...trip, members: updatedMembers };
      updateActiveTrip(updatedTripObj);

      setIsMembersModalOpen(false);
      setEditingMember(null);
    } catch (err: any) {
      console.error("Failed to delete member from Database:", err);
      alert(err?.message || "Failed to delete member. Please try again.");
    }
  };

  // CREATE TRIP HANDLER: DATABASE PRIMARY WRITE PATH
  const handleCreateTrip = async (newTripData: Trip) => {
    try {
      const activeUid = authUser?.id || "";
      const completeTrip: Trip = {
        ...newTripData,
        ownerId: newTripData.ownerId || activeUid,
        ownerName: newTripData.ownerName || authUser?.name || "Traveler",
        memberUserIds: Array.from(
          new Set([
            newTripData.ownerId || activeUid,
            ...(newTripData.memberUserIds || []),
            ...(newTripData.members || []).map((m) => m.userId || m.id),
          ].filter(Boolean))
        ),
      };

      // Optimistically update local state & close modal
      setTrips((prev) => [completeTrip, ...prev.filter((t) => t.id !== completeTrip.id)]);
      setActiveTripId(completeTrip.id);
      setIsTripsHubModalOpen(false);

      // Save user local snapshot
      if (activeUid) {
        saveUserLocalState(activeUid, {
          trips: [completeTrip, ...trips.filter((t) => t.id !== completeTrip.id)],
          activeTripId: completeTrip.id,
        });
      }

      // Awaited database operation
      await saveTripToDatabase(completeTrip);
    } catch (err: any) {
      console.error("Failed to create trip in Database:", err);
    }
  };

  // DELETE TRIP HANDLER: DATABASE PRIMARY WRITE PATH
  const handleDeleteTrip = async (id: string) => {
    try {
      await deleteTripFromDatabase(id);
      const filtered = trips.filter((t) => t.id !== id);
      setTrips(filtered);
      if (activeTripId === id && filtered.length > 0) {
        setActiveTripId(filtered[0].id);
      }
    } catch (err: any) {
      console.error("Failed to delete trip from Database:", err);
      alert(err?.message || "Failed to delete trip. Please try again.");
    }
  };

  // RESET TRIP HANDLER
  const handleConfirmReset = (mode: "clean_scratch") => {
    const freshState = resetStorageState(mode, authUser || DEFAULT_AUTH_USER);
    setTrips(freshState.trips);
    setActiveTripId(freshState.activeTripId || freshState.trips[0]?.id || "");
    setActiveTab("home");
  };

  // Open Settle modal with optional preselection
  const handleOpenSettleModalWithParams = (debtorId?: string, creditorId?: string, amount?: number) => {
    setSettlePreselect({ debtorId, creditorId, amount });
    setIsSettleModalOpen(true);
  };

  // WhatsApp statement trigger
  const handleSendWhatsAppStatement = (member: Member) => {
    if (!trip) return;
    const ps = paidShare[member.id] || { paid: 0, share: 0 };
    const net = netBalances[member.id] || 0;
    const statusText =
      net > 0.01
        ? `*You are owed ${money(net, trip.currency)}* by the group.`
        : net < -0.01
        ? `*You owe ${money(Math.abs(net), trip.currency)}* to the group.`
        : `*All Settled Up!* No pending balance.`;

    const message = `🏖️ *${trip.title} Statement for ${member.name}*\n\n` +
      `• Total Spent by Group: ${money(totalTripSpent, trip.currency)}\n` +
      `• You Paid Upfront: ${money(ps.paid, trip.currency)}\n` +
      `• Your Fair Share: ${money(ps.share, trip.currency)}\n` +
      `• *Net Balance*: ${statusText}\n\n` +
      `Track full details on SplitTrip!`;

    setWhatsAppPayload({
      title: `Send Statement to ${member.name}`,
      messageText: message,
      targetPhone: member.phone,
      targetMemberIds: [member.id],
      eventType: "reminder",
    });
    setIsWhatsAppModalOpen(true);
  };

  // LOADING STATE
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-[var(--c-paper,#0F172A)] text-[var(--c-ink,#F8FAFC)] flex flex-col items-center justify-center p-6">
        <div className="w-14 h-14 rounded-2xl bg-[var(--c-teal,#2DD4BF)] text-[var(--c-teal-contrast-text,#0F172A)] flex items-center justify-center shadow-lg animate-pulse mb-4">
          <Compass size={28} />
        </div>
        <div className="text-base font-bold">Trip Expense Splitter</div>
        <div className="text-xs text-[var(--c-inkSoft,#94A3B8)] mt-1">Loading saved trip state...</div>
      </div>
    );
  }

  // AUTH STATE
  if (!authUser) {
    return <LoginPage />;
  }

  // EMPTY STATE
  if (!trip) {
    return (
      <div className="min-h-screen bg-[var(--c-paper,#0F172A)] text-[var(--c-ink,#F8FAFC)]">
        <EmptyTripStateView
          authUser={authUser}
          onOpenJoinModal={() => setIsJoinTripModalOpen(true)}
          onOpenCreateTrip={() => setIsTripsHubModalOpen(true)}
          onOpenUserProfile={() => setIsUserProfileOpen(true)}
          onLogout={() => logout()}
          onJoinSuccess={(joinedTrip) => {
            if (!trips.find(t => t.id === joinedTrip.id)) {
              setTrips(prev => [joinedTrip, ...prev]);
            } else {
              setTrips(prev => prev.map(t => t.id === joinedTrip.id ? joinedTrip : t));
            }
            setActiveTripId(joinedTrip.id);
            setIsJoinTripModalOpen(false);
          }}
        />
        {isUserProfileOpen && (
          <UserProfileModal
            isOpen={isUserProfileOpen}
            onClose={() => setIsUserProfileOpen(false)}
            onOpenAuthPage={() => {
              logout();
              setIsUserProfileOpen(false);
            }}
          />
        )}
        {isJoinTripModalOpen && (
          <JoinTripModal
            currentTrip={null}
            initialCode={initialJoinCode}
            onClose={() => setIsJoinTripModalOpen(false)}
            onJoinTripSuccess={(joinedTrip) => {
              if (!trips.find(t => t.id === joinedTrip.id)) {
                setTrips(prev => [joinedTrip, ...prev]);
              } else {
                setTrips(prev => prev.map(t => t.id === joinedTrip.id ? joinedTrip : t));
              }
              setActiveTripId(joinedTrip.id);
              setIsJoinTripModalOpen(false);
            }}
          />
        )}
        {isTripsHubModalOpen && (
          <TripsHubModal
            trips={userTrips}
            activeTripId={activeTripId}
            onSelectTrip={(id) => {
              setActiveTripId(id);
              setIsTripsHubModalOpen(false);
            }}
            onCreateTrip={handleCreateTrip}
            onDeleteTrip={handleDeleteTrip}
            onOpenJoinModal={() => {
              setIsTripsHubModalOpen(false);
              setIsJoinTripModalOpen(true);
            }}
            onClose={() => setIsTripsHubModalOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--c-paper,#0F172A)] text-[var(--c-ink,#F8FAFC)] pb-24 md:pb-12">
      {/* 1. TOP APP BAR */}
      <header
        className="sticky top-0 z-30 w-full shrink-0 shadow-xs backdrop-blur-md"
        style={{
          backgroundColor: "var(--c-paper, #0F172A)",
          borderBottom: "1px solid var(--c-line, #334155)",
        }}
      >
        <div className="max-w-4xl mx-auto px-3.5 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Left: Trip Identity (Trip Icon + Title + Location + Currency + Hub trigger) */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Trip Icon Button */}
            <button
              id="btn-header-trips-hub-icon"
              type="button"
              onClick={() => setIsTripsHubModalOpen(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-transform hover:scale-105 cursor-pointer"
              style={{
                backgroundColor: "var(--c-badge-brand-bg, #042F2E)",
                border: "1px solid var(--c-line, #334155)",
                color: "var(--c-badge-brand-text, #5EEAD4)",
              }}
              title="Open Trips Hub (Switch or create trips)"
            >
              <Banknote size={20} />
            </button>

            <div className="min-w-0 flex flex-col justify-center flex-1 overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
                <button
                  id="btn-header-trip-title"
                  type="button"
                  onClick={() => setIsTripsHubModalOpen(true)}
                  className="text-sm sm:text-base font-extrabold tracking-tight truncate cursor-pointer text-left transition-opacity hover:opacity-80 shrink-0 max-w-[140px] sm:max-w-[240px]"
                  style={{ color: "var(--c-ink, #F8FAFC)" }}
                  title="Click to view all trips"
                >
                  {trip.title}
                </button>

                {/* Currency Badge */}
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0"
                  style={{
                    backgroundColor: "var(--c-paperDark, #1E293B)",
                    color: "var(--c-marigold, #F59E0B)",
                    border: "1px solid var(--c-line, #334155)",
                  }}
                >
                  {trip.currency || "INR"}
                </span>

                {/* Hub Button */}
                <button
                  type="button"
                  onClick={() => setIsTripsHubModalOpen(true)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-80 shrink-0"
                  style={{
                    backgroundColor: "var(--c-badge-yellow-bg, #352610)",
                    color: "var(--c-badge-yellow-text, #FBBF24)",
                    border: "1px solid var(--c-badge-yellow-text, #FBBF24)",
                  }}
                  title="Switch or manage trips in Trips Hub"
                >
                  <Compass size={11} />
                  <span className="hidden sm:inline">Hub</span>
                </button>
              </div>

              {/* Subtitle with Location Pin */}
              <div className="flex items-center gap-1 text-[11px] font-medium truncate mt-0.5" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                <MapPin size={11} style={{ color: "var(--c-rust, #F87171)" }} className="shrink-0" />
                <span className="truncate">{trip.location}</span>
              </div>
            </div>
          </div>

          {/* Right: User Switcher Pill + Notification Bell + More Menu Dots */}
          <div className="flex items-center gap-2 shrink-0">
            {/* User Pill Button: [A] Ayan ▾ */}
            <button
              id="btn-user-profile-menu"
              type="button"
              onClick={() => setIsUserProfileOpen(true)}
              className="flex items-center gap-1.5 rounded-full px-2 sm:px-2.5 py-1.5 transition-all cursor-pointer shadow-xs hover:opacity-80"
              style={{
                backgroundColor: "var(--c-paperDark, #1E293B)",
                border: "1px solid var(--c-line, #334155)",
              }}
              title={`Logged in as ${currentUser.name}. Click to switch traveler.`}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shrink-0"
                style={{
                  backgroundColor: currentUser.avatarColor || "#E39A2D",
                  textShadow: "0px 1px 2px rgba(0,0,0,0.5)",
                }}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline text-xs font-bold max-w-[100px] truncate" style={{ color: "var(--c-ink, #F8FAFC)" }}>
                {currentUser.name}
              </span>
              <ChevronDown size={12} style={{ color: "var(--c-inkSoft, #94A3B8)" }} />
            </button>

            {/* Notification Bell */}
            <NotificationBell onClick={() => setIsNotificationsOpen(true)} />

            {/* More Menu Dots Button [⋮] */}
            <button
              id="btn-open-trip-more-menu"
              type="button"
              onClick={() => setIsMoreMenuOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shadow-xs hover:opacity-80"
              style={{
                backgroundColor: "var(--c-card, #1E293B)",
                border: "1px solid var(--c-line, #334155)",
                color: "var(--c-ink, #F8FAFC)",
              }}
              title="More options & settings"
            >
              <MoreVertical size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN APPLICATION CONTENT */}
      <main className="max-w-md md:max-w-3xl lg:max-w-4xl mx-auto px-3.5 sm:px-6 pt-4 flex flex-col gap-4">
        {/* TAB: HOME DASHBOARD (EXACT AS SCREENSHOT) */}
        {activeTab === "home" && (
          <HomeDashboardView
            trip={trip}
            currentUser={currentUser}
            currentUserId={currentUser.id}
            totalTripSpent={totalTripSpent}
            userStats={userStats}
            simplifiedDebts={simplifiedDebts}
            onOpenAddExpense={() => {
              setEditingExpense(null);
              setIsExpenseModalOpen(true);
            }}
            onOpenSettleModal={() => handleOpenSettleModalWithParams()}
            onOpenInviteModal={() => setIsInviteModalOpen(true)}
            onNavigateToExpenses={() => setActiveTab("expenses")}
            onNavigateToSettlement={() => setActiveTab("settlement")}
            onNavigateToAnalytics={() => setActiveTab("analytics")}
            onNavigateToActivity={() => setActiveTab("activity")}
            onOpenTripsHub={() => setIsTripsHubModalOpen(true)}
          />
        )}

        {/* TAB: EXPENSES LIST */}
        {activeTab === "expenses" && (
          <ExpensesListView
            expenses={trip.expenses}
            members={trip.members}
            currentUserId={currentUser.id}
            currency={trip.currency}
            onOpenAddExpense={() => {
              setEditingExpense(null);
              setIsExpenseModalOpen(true);
            }}
            onEditExpense={(exp) => {
              setEditingExpense(exp);
              setIsExpenseModalOpen(true);
            }}
            onDeleteExpense={handleDeleteExpense}
          />
        )}

        {/* TAB: BALANCES & DEBT SIMPLIFICATION */}
        {activeTab === "settlement" && (
          <BalanceView
            trip={trip}
            currentUser={currentUser}
            currentUserId={currentUser.id}
            userStats={userStats}
            simplifiedDebts={simplifiedDebts}
            onOpenSettleModal={handleOpenSettleModalWithParams}
            onConfirmPayment={handleConfirmPayment}
            onRejectPayment={handleRejectPayment}
            onSendWhatsAppReminder={(debtor, amt) => {
              const msg = `Hi ${debtor.name}, a friendly reminder regarding our *${trip.title}* trip expenses: you have an outstanding balance of *${money(amt, trip.currency)}*.`;
              setWhatsAppPayload({
                title: `Send Reminder to ${debtor.name}`,
                messageText: msg,
                targetPhone: debtor.phone,
                targetMemberIds: [debtor.id],
                eventType: "reminder",
              });
              setIsWhatsAppModalOpen(true);
            }}
          />
        )}

        {/* TAB: ANALYTICS */}
        {activeTab === "analytics" && (
          <AnalyticsView
            expenses={trip.expenses}
            members={trip.members}
            payments={trip.payments || []}
            paidShare={paidShare}
          />
        )}

        {/* TAB: PEOPLE */}
        {activeTab === "people" && (
          <PeopleView
            trip={trip}
            currentUser={currentUser}
            currentUserId={currentUser.id}
            memberStats={memberStatsObj}
            onOpenInviteModal={() => setIsInviteModalOpen(true)}
            onOpenEditMember={(m) => {
              setEditingMember(m);
              setIsMembersModalOpen(true);
            }}
            onSendWhatsAppStatement={handleSendWhatsAppStatement}
          />
        )}

        {/* TAB: ACTIVITY LOG */}
        {activeTab === "activity" && (
          <ActivityLogView
            activities={trip.activities || []}
            members={trip.members || []}
          />
        )}
      </main>

      {/* 3. BOTTOM NAVIGATION BAR (MATCHES SCREENSHOT: Home, Expenses, +, Balance, People) */}
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={(t) => setActiveTab(t)}
        onOpenAddExpense={() => {
          setEditingExpense(null);
          setIsExpenseModalOpen(true);
        }}
        pendingSettlementsCount={simplifiedDebts.length}
        expensesCount={activeExpenses.length}
      />

      {/* 4. MODAL DIALOGS */}
      {/* Add / Edit Expense Modal */}
      {isExpenseModalOpen && (
        <ExpenseFormModal
          members={trip.members}
          initialExpense={editingExpense}
          currentUserId={currentUser.id}
          onSave={handleSaveExpense}
          onClose={() => {
            setIsExpenseModalOpen(false);
            setEditingExpense(null);
          }}
        />
      )}

      {/* Settle Up Modal */}
      {isSettleModalOpen && (
        <SettleUpModal
          tripId={trip.id}
          members={trip.members}
          simplifiedDebts={simplifiedDebts}
          payments={trip.payments || []}
          tripTitle={trip.title}
          currentUserId={currentUser.id}
          onRecordPayment={handleRecordPayment}
          onUpdatePaymentStatus={(id, status) => {
            if (status === "confirmed" || status === "PAID") handleConfirmPayment(id);
            else handleRejectPayment(id);
          }}
          onDeletePayment={handleRejectPayment}
          onClose={() => {
            setIsSettleModalOpen(false);
            setSettlePreselect({});
          }}
        />
      )}

      {/* Invite Friends Modal */}
      {isInviteModalOpen && (
        <InviteMembersModal
          trip={trip}
          currentUserName={currentUser.name}
          currentUser={currentUser}
          onUpdateTrip={updateActiveTrip}
          onOpenSelfRegister={() => setIsInviteModalOpen(false)}
          onClose={() => setIsInviteModalOpen(false)}
        />
      )}

      {/* Manage Members Modal */}
      {isMembersModalOpen && (
        <MemberManagementModal
          members={trip.members}
          currentUserId={currentUser.id}
          balances={paidShare}
          onAddMember={handleSaveMember}
          onUpdateMember={handleSaveMember}
          onRemoveMember={handleDeleteMember}
          onOpenInvite={() => {
            setIsMembersModalOpen(false);
            setIsInviteModalOpen(true);
          }}
          onClose={() => {
            setIsMembersModalOpen(false);
            setEditingMember(null);
          }}
        />
      )}

      {/* Reset Trip Modal */}
      {isResetModalOpen && (
        <ResetTripModal
          onConfirmReset={handleConfirmReset}
          onClose={() => setIsResetModalOpen(false)}
        />
      )}

      {/* Trips Hub Modal */}
      {isTripsHubModalOpen && (
        <TripsHubModal
          trips={userTrips}
          activeTripId={activeTripId}
          onSelectTrip={(id) => {
            setActiveTripId(id);
            setIsTripsHubModalOpen(false);
          }}
          onCreateTrip={handleCreateTrip}
          onDeleteTrip={handleDeleteTrip}
          onOpenJoinModal={() => {
            setIsTripsHubModalOpen(false);
            setIsJoinTripModalOpen(true);
          }}
          onClose={() => setIsTripsHubModalOpen(false)}
        />
      )}

      {/* Share & Export Modal */}
      {isShareModalOpen && (
        <ShareExportModal
          trip={trip}
          simplifiedDebts={simplifiedDebts}
          paidShare={paidShare}
          netBalances={netBalances}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {/* Trip More Menu Modal */}
      <TripMoreMenuModal
        isOpen={isMoreMenuOpen}
        onClose={() => setIsMoreMenuOpen(false)}
        trip={trip}
        currentUser={currentUser}
        currentUserId={currentUser.id}
        onSelectUserId={(id) => {
          setCurrentUserId(id);
        }}
        authUser={authUser}
        onOpenAddExpense={() => {
          setIsMoreMenuOpen(false);
          setEditingExpense(null);
          setIsExpenseModalOpen(true);
        }}
        onOpenProfile={() => {
          setIsMoreMenuOpen(false);
          setIsUserProfileOpen(true);
        }}
        onOpenWhatsAppAlerts={() => {
          setIsMoreMenuOpen(false);
          handleSendWhatsAppStatement(currentUser);
        }}
        onOpenInviteModal={() => {
          setIsMoreMenuOpen(false);
          setIsInviteModalOpen(true);
        }}
        onOpenMembersModal={() => {
          setIsMoreMenuOpen(false);
          setIsMembersModalOpen(true);
        }}
        onOpenShareModal={() => {
          setIsMoreMenuOpen(false);
          setIsShareModalOpen(true);
        }}
        onOpenNotificationsModal={() => {
          setIsMoreMenuOpen(false);
          setIsNotificationsOpen(true);
        }}
        onOpenTripsHub={() => {
          setIsMoreMenuOpen(false);
          setIsTripsHubModalOpen(true);
        }}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        onOpenAuthPage={() => setIsUserProfileOpen(false)}
      />

      {/* Notification Center Modal */}
      <NotificationCenterModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        trip={trip}
        currentUserId={currentUser.id}
        onNavigateTab={(t) => {
          if (t === "expenses" || t === "settlement" || t === "analytics" || t === "people" || t === "home") {
            setActiveTab(t);
          }
        }}
      />

      {/* WhatsApp Message Preview Modal */}
      {isWhatsAppModalOpen && whatsAppPayload && (
        <WhatsAppNotificationModal
          payload={whatsAppPayload}
          members={trip.members}
          onClose={() => {
            setIsWhatsAppModalOpen(false);
            setWhatsAppPayload(null);
          }}
        />
      )}

      {/* Join Trip Modal for Main App */}
      {isJoinTripModalOpen && (
        <JoinTripModal
          currentTrip={null}
          initialCode={initialJoinCode}
          onClose={() => setIsJoinTripModalOpen(false)}
          onJoinTripSuccess={(joinedTrip) => {
            if (!trips.find(t => t.id === joinedTrip.id)) {
              setTrips(prev => [joinedTrip, ...prev]);
            } else {
              setTrips(prev => prev.map(t => t.id === joinedTrip.id ? joinedTrip : t));
            }
            setActiveTripId(joinedTrip.id);
            setIsJoinTripModalOpen(false);
          }}
        />
      )}

      {/* In-App Notification Toasts */}
      <NotificationToastContainer />

      {/* Global Password Reset / Recovery Modal */}
      <ResetPasswordModal />
    </div>
  );
}
