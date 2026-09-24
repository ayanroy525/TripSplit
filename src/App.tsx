import React, { useState } from "react";
import {
  MapPin,
  ChevronDown,
  MoreVertical,
  Banknote,
  Compass,
  Plus,
} from "lucide-react";
import {
  Member,
  Expense,
  NavTab,
  WhatsAppNotificationPayload,
} from "./types";
import { useAuth } from "./context/AuthContext";
import { useNotifications } from "./context/NotificationContext";
import { useTripData } from "./hooks/useTripData";
import { useTripActions } from "./hooks/useTripActions";

// Views
import { HomeDashboardView } from "./components/HomeDashboardView";
import { ExpensesListView } from "./components/ExpensesListView";
import { BalanceView } from "./components/BalanceView";
import { AnalyticsView } from "./components/AnalyticsView";
import { PeopleView } from "./components/PeopleView";
import { ActivityLogView } from "./components/ActivityLogView";
import { EmptyTripStateView } from "./components/EmptyTripStateView";
import { LoginPage } from "./components/LoginPage";

// Shell & Navigation Components
import { BottomNavigation } from "./components/BottomNavigation";
import { NotificationBell } from "./components/NotificationBell";
import { NotificationToastContainer } from "./components/NotificationToastContainer";

// Modals
import { ExpenseFormModal } from "./components/ExpenseFormModal";
import { SettleUpModal } from "./components/SettleUpModal";
import { MemberManagementModal } from "./components/MemberManagementModal";
import { InviteMembersModal } from "./components/InviteMembersModal";
import { ResetTripModal } from "./components/ResetTripModal";
import { TripsHubModal } from "./components/TripsHubModal";
import { ShareExportModal } from "./components/ShareExportModal";
import { TripMoreMenuModal } from "./components/TripMoreMenuModal";
import { UserProfileModal } from "./components/UserProfileModal";
import { NotificationCenterModal } from "./components/NotificationCenterModal";
import { WhatsAppNotificationModal } from "./components/WhatsAppNotificationModal";
import { JoinTripModal } from "./components/JoinTripModal";
import { ResetPasswordModal } from "./components/ResetPasswordModal";

export default function App() {
  const {
    currentUser: authUser,
    logout,
  } = useAuth();
  const { notify } = useNotifications();

  // 1. Data Layer Hook
  const {
    isHydrated,
    trips,
    setTrips,
    activeTripId,
    setActiveTripId,
    setCurrentUserId,
    userTrips,
    trip,
    currentUser,
    updateActiveTrip,
    activeExpenses,
    totalTripSpent,
    paidShare,
    netBalances,
    simplifiedDebts,
    userStats,
    memberStatsObj,
    initialJoinCode,
    setInitialJoinCode,
    autoOpenJoinModal,
    setAutoOpenJoinModal,
  } = useTripData({ authUser, onNotify: notify });

  // 2. Action Layer Hook
  const {
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
  } = useTripActions({
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
  });

  // 3. UI Presentation States
  const [activeTab, setActiveTab] = useState<NavTab>("home");
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
  const [whatsAppPayload, setWhatsAppPayload] = useState<WhatsAppNotificationPayload | null>(null);
  const [isJoinTripModalOpen, setIsJoinTripModalOpen] = useState(false);

  // Sync autoOpenJoinModal from deep-link routing
  React.useEffect(() => {
    if (autoOpenJoinModal) {
      setIsJoinTripModalOpen(true);
      setAutoOpenJoinModal(false);
    }
  }, [autoOpenJoinModal, setAutoOpenJoinModal]);

  // Modal open helper with preselection
  const handleOpenSettleModalWithParams = (debtorId?: string, creditorId?: string, amount?: number) => {
    setSettlePreselect({ debtorId, creditorId, amount });
    setIsSettleModalOpen(true);
  };

  // WhatsApp statement trigger
  const handleSendWhatsAppStatement = (member: Member) => {
    const payload = buildWhatsAppStatementPayload(member);
    if (payload) {
      setWhatsAppPayload(payload);
      setIsWhatsAppModalOpen(true);
    }
  };

  // WhatsApp reminder trigger
  const handleSendWhatsAppReminder = (debtor: Member, amt: number) => {
    const payload = buildWhatsAppReminderPayload(debtor, amt);
    if (payload) {
      setWhatsAppPayload(payload);
      setIsWhatsAppModalOpen(true);
    }
  };

  // 4. Loading State
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

  // 5. Auth Gate
  if (!authUser) {
    return <LoginPage />;
  }

  // 6. Empty Trips State
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
            if (!trips.find((t) => t.id === joinedTrip.id)) {
              setTrips((prev) => [joinedTrip, ...prev]);
            } else {
              setTrips((prev) => prev.map((t) => (t.id === joinedTrip.id ? joinedTrip : t)));
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
              if (!trips.find((t) => t.id === joinedTrip.id)) {
                setTrips((prev) => [joinedTrip, ...prev]);
              } else {
                setTrips((prev) => prev.map((t) => (t.id === joinedTrip.id ? joinedTrip : t)));
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
            onCreateTrip={async (newTrip) => {
              await handleCreateTrip(newTrip);
              setIsTripsHubModalOpen(false);
            }}
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

  // 7. Main Application Shell
  return (
    <div className="min-h-screen bg-[var(--c-paper,#0F172A)] text-[var(--c-ink,#F8FAFC)] pb-24 md:pb-12">
      {/* Top App Bar */}
      <header
        className="sticky top-0 z-30 w-full shrink-0 shadow-xs backdrop-blur-md"
        style={{
          backgroundColor: "var(--c-paper, #0F172A)",
          borderBottom: "1px solid var(--c-line, #334155)",
        }}
      >
        <div className="max-w-4xl mx-auto px-3.5 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Left: Trip Identity & Hub trigger */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
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

              <div className="flex items-center gap-1 text-[11px] font-medium truncate mt-0.5" style={{ color: "var(--c-inkSoft, #94A3B8)" }}>
                <MapPin size={11} style={{ color: "var(--c-rust, #F87171)" }} className="shrink-0" />
                <span className="truncate">{trip.location}</span>
              </div>
            </div>
          </div>

          {/* Right: User Switcher Pill + Notification Bell + More Menu Dots */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-user-profile-menu"
              type="button"
              onClick={() => setIsUserProfileOpen(true)}
              className="flex items-center gap-1.5 rounded-full px-2 sm:px-2.5 py-1.5 transition-all cursor-pointer shadow-xs hover:opacity-80"
              style={{
                backgroundColor: "var(--c-paperDark, #1E293B)",
                border: "1px solid var(--c-line, #334155)",
              }}
              title={`Logged in as ${currentUser.name}. Click to view profile.`}
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

            <NotificationBell onClick={() => setIsNotificationsOpen(true)} />

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

        {/* Desktop Navigation Tabs (md and up) */}
        <nav className="hidden md:flex items-center gap-1.5 border-t border-[var(--c-line)] px-4 py-2 text-xs font-bold max-w-4xl mx-auto">
          {[
            { id: "home", label: "Dashboard" },
            { id: "expenses", label: `Expenses (${activeExpenses.length})` },
            { id: "settlement", label: `Settlements ${simplifiedDebts.length > 0 ? `(${simplifiedDebts.length})` : ""}` },
            { id: "people", label: `People (${trip.members.length})` },
            { id: "analytics", label: "Analytics" },
            { id: "activity", label: "Activity" },
          ].map((tab) => {
            const isActive =
              activeTab === tab.id ||
              (tab.id === "settlement" && (activeTab === "balances" || activeTab === "settlements")) ||
              (tab.id === "people" && activeTab === "members");
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as NavTab)}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? "bg-[var(--c-teal)] text-[var(--c-teal-contrast-text)] shadow-xs"
                    : "text-[var(--c-inkSoft)] hover:text-[var(--c-ink)] hover:bg-[var(--c-paperDark)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="max-w-md md:max-w-3xl lg:max-w-4xl mx-auto px-3.5 sm:px-6 pt-4 flex flex-col gap-4">
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

        {(activeTab === "settlement" || activeTab === "balances" || activeTab === "settlements") && (
          <BalanceView
            trip={trip}
            currentUser={currentUser}
            currentUserId={currentUser.id}
            userStats={userStats}
            simplifiedDebts={simplifiedDebts}
            onOpenSettleModal={handleOpenSettleModalWithParams}
            onConfirmPayment={handleConfirmPayment}
            onRejectPayment={handleRejectPayment}
            onSendWhatsAppReminder={handleSendWhatsAppReminder}
          />
        )}

        {activeTab === "analytics" && (
          <AnalyticsView
            expenses={trip.expenses}
            members={trip.members}
            payments={trip.payments || []}
            paidShare={paidShare}
          />
        )}

        {(activeTab === "people" || activeTab === "members") && (
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

        {activeTab === "activity" && (
          <ActivityLogView
            activities={trip.activities || []}
            members={trip.members || []}
          />
        )}
      </main>

      {/* Bottom Navigation Bar */}
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

      {/* Floating Action Button for Desktop/Tablet */}
      <button
        id="btn-desktop-floating-add-expense"
        type="button"
        onClick={() => {
          setEditingExpense(null);
          setIsExpenseModalOpen(true);
        }}
        className="hidden md:flex fixed bottom-8 right-8 z-40 bg-[var(--c-teal,#0F6B65)] hover:bg-[var(--c-tealDark,#0B4F4B)] text-white px-5 py-3.5 rounded-2xl shadow-xl items-center gap-2.5 font-extrabold text-sm hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20"
        title="Add new expense"
      >
        <Plus size={20} strokeWidth={3} />
        <span>Add Expense</span>
      </button>

      {/* Modal Dialogs */}
      {isExpenseModalOpen && (
        <ExpenseFormModal
          members={trip.members}
          initialExpense={editingExpense}
          currentUserId={currentUser.id}
          onSave={async (exp) => {
            const success = await handleSaveExpense(exp);
            if (success) {
              setIsExpenseModalOpen(false);
              setEditingExpense(null);
            }
          }}
          onClose={() => {
            setIsExpenseModalOpen(false);
            setEditingExpense(null);
          }}
        />
      )}

      {isSettleModalOpen && (
        <SettleUpModal
          tripId={trip.id}
          members={trip.members}
          simplifiedDebts={simplifiedDebts}
          payments={trip.payments || []}
          tripTitle={trip.title}
          currentUserId={currentUser.id}
          onRecordPayment={async (p) => {
            const success = await handleRecordPayment(p);
            if (success) {
              setIsSettleModalOpen(false);
              setSettlePreselect({});
            }
          }}
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

      {isMembersModalOpen && (
        <MemberManagementModal
          members={trip.members}
          currentUserId={currentUser.id}
          balances={paidShare}
          onAddMember={async (m) => {
            const success = await handleSaveMember(m);
            if (success) {
              setIsMembersModalOpen(false);
              setEditingMember(null);
            }
          }}
          onUpdateMember={async (m) => {
            const success = await handleSaveMember(m);
            if (success) {
              setIsMembersModalOpen(false);
              setEditingMember(null);
            }
          }}
          onRemoveMember={async (mId) => {
            const success = await handleDeleteMember(mId);
            if (success) {
              setIsMembersModalOpen(false);
              setEditingMember(null);
            }
          }}
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

      {isResetModalOpen && (
        <ResetTripModal
          onConfirmReset={(mode) => {
            handleConfirmReset(mode);
            setIsResetModalOpen(false);
            setActiveTab("home");
          }}
          onClose={() => setIsResetModalOpen(false)}
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
          onCreateTrip={async (newTrip) => {
            await handleCreateTrip(newTrip);
            setIsTripsHubModalOpen(false);
          }}
          onDeleteTrip={handleDeleteTrip}
          onOpenJoinModal={() => {
            setIsTripsHubModalOpen(false);
            setIsJoinTripModalOpen(true);
          }}
          onClose={() => setIsTripsHubModalOpen(false)}
        />
      )}

      {isShareModalOpen && (
        <ShareExportModal
          trip={trip}
          simplifiedDebts={simplifiedDebts}
          paidShare={paidShare}
          netBalances={netBalances}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

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

      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        onOpenAuthPage={() => setIsUserProfileOpen(false)}
      />

      <NotificationCenterModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        trip={trip}
        currentUserId={currentUser.id}
        onNavigateTab={(t) => {
          if (
            t === "expenses" ||
            t === "settlement" ||
            t === "analytics" ||
            t === "people" ||
            t === "home"
          ) {
            setActiveTab(t);
          }
        }}
      />

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

      {isJoinTripModalOpen && (
        <JoinTripModal
          currentTrip={null}
          initialCode={initialJoinCode}
          onClose={() => setIsJoinTripModalOpen(false)}
          onJoinTripSuccess={(joinedTrip) => {
            if (!trips.find((t) => t.id === joinedTrip.id)) {
              setTrips((prev) => [joinedTrip, ...prev]);
            } else {
              setTrips((prev) => prev.map((t) => (t.id === joinedTrip.id ? joinedTrip : t)));
            }
            setActiveTripId(joinedTrip.id);
            setIsJoinTripModalOpen(false);
          }}
        />
      )}

      <NotificationToastContainer />
      <ResetPasswordModal />
    </div>
  );
}
