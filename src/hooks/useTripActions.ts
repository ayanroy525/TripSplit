import confetti from "canvas-confetti";
import {
  Trip,
  Member,
  Expense,
  Payment,
  UserAccount,
  WhatsAppNotificationPayload,
} from "../types";
import { money, nowStr, uid } from "../utils/calculations";
import {
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
  saveUserLocalState,
  resetStorageState,
  DEFAULT_AUTH_USER,
} from "../utils/storage";

interface UseTripActionsProps {
  trip: Trip | null;
  trips: Trip[];
  currentUser: Member;
  authUser: UserAccount | null;
  activeTripId: string;
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  setActiveTripId: React.Dispatch<React.SetStateAction<string>>;
  updateActiveTrip: (trip: Trip) => void;
  notify: (notification: any) => void;
  paidShare: Record<string, { paid: number; share: number }>;
  netBalances: Record<string, number>;
  totalTripSpent: number;
}

export function triggerConfetti() {
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.6 },
    colors: ["#2DD4BF", "#E39A2D", "#8B5CF6", "#4ADE80"],
  });
}

export function useTripActions({
  trip,
  trips,
  currentUser,
  authUser,
  activeTripId,
  setTrips,
  setActiveTripId,
  updateActiveTrip,
  notify,
  paidShare,
  netBalances,
  totalTripSpent,
}: UseTripActionsProps) {
  // 1. EXPENSE HANDLERS
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

      triggerConfetti();
      return true;
    } catch (err: any) {
      console.error("Failed to save expense:", err);
      alert(err?.message || "Failed to save expense. Please check your network connection and try again.");
      return false;
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
      console.error("Failed to delete expense:", err);
      alert(err?.message || "Failed to delete expense. Please try again.");
    }
  };

  // 2. SETTLEMENT / PAYMENT HANDLERS
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

      triggerConfetti();
      return true;
    } catch (err: any) {
      console.error("Failed to record payment:", err);
      alert(err?.message || "Failed to record payment. Please try again.");
      return false;
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
      console.error("Failed to confirm payment:", err);
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

      await updatePaymentInDatabase(trip.id, updatedPayment);

      const updatedPayments = (trip.payments || []).map((p) =>
        p.id === paymentId ? updatedPayment : p
      );
      const updatedTripObj = { ...trip, payments: updatedPayments };
      updateActiveTrip(updatedTripObj);
    } catch (err: any) {
      console.error("Failed to cancel payment:", err);
      alert(err?.message || "Failed to cancel payment. Please try again.");
    }
  };

  // 3. MEMBER HANDLERS
  const handleSaveMember = async (member: Member) => {
    if (!trip) return;
    try {
      const isEdit = trip.members.some((m) => m.id === member.id);

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
      return true;
    } catch (err: any) {
      console.error("Failed to save member:", err);
      alert(err?.message || "Failed to save member. Please try again.");
      return false;
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!trip) return;
    try {
      await deleteMemberFromDatabase(trip.id, memberId);

      const updatedMembers = trip.members.filter((m) => m.id !== memberId);
      const updatedTripObj = { ...trip, members: updatedMembers };
      updateActiveTrip(updatedTripObj);
      return true;
    } catch (err: any) {
      console.error("Failed to delete member:", err);
      alert(err?.message || "Failed to delete member. Please try again.");
      return false;
    }
  };

  // 4. TRIP LIFECYCLE HANDLERS
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

      setTrips((prev) => [completeTrip, ...prev.filter((t) => t.id !== completeTrip.id)]);
      setActiveTripId(completeTrip.id);

      if (activeUid) {
        saveUserLocalState(activeUid, {
          trips: [completeTrip, ...trips.filter((t) => t.id !== completeTrip.id)],
          activeTripId: completeTrip.id,
        });
      }

      await saveTripToDatabase(completeTrip);
      return true;
    } catch (err: any) {
      console.error("Failed to create trip:", err);
      return false;
    }
  };

  const handleDeleteTrip = async (id: string) => {
    try {
      await deleteTripFromDatabase(id);
      const filtered = trips.filter((t) => t.id !== id);
      setTrips(filtered);
      if (activeTripId === id && filtered.length > 0) {
        setActiveTripId(filtered[0].id);
      }
    } catch (err: any) {
      console.error("Failed to delete trip:", err);
      alert(err?.message || "Failed to delete trip. Please try again.");
    }
  };

  const handleConfirmReset = (mode: "clean_scratch") => {
    const freshState = resetStorageState(mode, authUser || DEFAULT_AUTH_USER);
    setTrips(freshState.trips);
    setActiveTripId(freshState.activeTripId || freshState.trips[0]?.id || "");
  };

  // 5. COMMUNICATION & WHATSAPP HELPERS
  const buildWhatsAppStatementPayload = (member: Member): WhatsAppNotificationPayload | null => {
    if (!trip) return null;
    const ps = paidShare[member.id] || { paid: 0, share: 0 };
    const net = netBalances[member.id] || 0;
    const statusText =
      net > 0.01
        ? `*You are owed ${money(net, trip.currency)}* by the group.`
        : net < -0.01
        ? `*You owe ${money(Math.abs(net), trip.currency)}* to the group.`
        : `*All Settled Up!* No pending balance.`;

    const message =
      `🏖️ *${trip.title} Statement for ${member.name}*\n\n` +
      `• Total Spent by Group: ${money(totalTripSpent, trip.currency)}\n` +
      `• You Paid Upfront: ${money(ps.paid, trip.currency)}\n` +
      `• Your Fair Share: ${money(ps.share, trip.currency)}\n` +
      `• *Net Balance*: ${statusText}\n\n` +
      `Track full details on SplitTrip!`;

    return {
      title: `Send Statement to ${member.name}`,
      messageText: message,
      targetPhone: member.phone,
      targetMemberIds: [member.id],
      eventType: "reminder",
    };
  };

  const buildWhatsAppReminderPayload = (
    debtor: Member,
    amount: number
  ): WhatsAppNotificationPayload | null => {
    if (!trip) return null;
    const msg = `Hi ${debtor.name}, a friendly reminder regarding our *${trip.title}* trip expenses: you have an outstanding balance of *${money(amount, trip.currency)}*.`;
    return {
      title: `Send Reminder to ${debtor.name}`,
      messageText: msg,
      targetPhone: debtor.phone,
      targetMemberIds: [debtor.id],
      eventType: "reminder",
    };
  };

  return {
    handleSaveExpense,
    handleDeleteExpense,
    handleRecordPayment,
    handleConfirmPayment,
    handleRejectPayment,
    handleSaveMember,
    handleDeleteMember,
    handleCreateTrip,
    handleDeleteTrip,
    handleConfirmReset,
    buildWhatsAppStatementPayload,
    buildWhatsAppReminderPayload,
  };
}
