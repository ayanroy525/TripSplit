import { useState, useEffect, useMemo } from "react";
import {
  Trip,
  Member,
  SimplifiedDebt,
  UserAccount,
} from "../types";
import {
  computeBalances,
  simplifyDebts,
} from "../utils/calculations";
import {
  loadUserLocalState,
  saveUserLocalState,
  isUserAuthorizedForTrip,
  subscribeToUserTrips,
} from "../utils/storage";

interface UseTripDataOptions {
  authUser: UserAccount | null;
  onNotify?: (notification: any) => void;
}

export function useTripData({ authUser, onNotify }: UseTripDataOptions) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>(() => authUser?.id || "");
  const [initialJoinCode, setInitialJoinCode] = useState<string>("");
  const [autoOpenJoinModal, setAutoOpenJoinModal] = useState<boolean>(false);

  // Keep currentUserId in sync with authUser.id
  useEffect(() => {
    const activeUid = authUser?.id;
    if (activeUid && activeUid !== currentUserId) {
      setCurrentUserId(activeUid);
    }
  }, [authUser?.id, currentUserId]);

  // Real-time synchronization & URL deep link routing
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
        setAutoOpenJoinModal(true);
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
          window.history.replaceState(null, "", window.location.pathname);
          if (onNotify) {
            onNotify({
              tripId: "system",
              tripTitle: "Trip Access",
              type: "system",
              title: "Trip Not Accessible",
              body: "You do not have access to this trip or it does not exist.",
              actorName: "System",
              actorAvatarColor: "#F59E0B",
            });
          }
          setActiveTripId(currentAuthorizedTrips[0].id);
        }
      }
    };

    // Real-time Supabase listener for trips belonging to the authenticated user
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

  // Current active member representation
  const currentUser: Member = useMemo(() => {
    const effectiveUid = authUser?.id || currentUserId || "user_guest";
    const effectiveName = authUser?.name || "Traveler";
    const effectiveColor = authUser?.avatarColor || "#0F6B65";
    const effectivePhone = authUser?.phone || "";

    if (trip && trip.members && trip.members.length > 0) {
      // 1. Direct ID / userId match
      let match = trip.members.find(
        (m) =>
          m.id === effectiveUid ||
          m.userId === effectiveUid ||
          (authUser?.id && (m.id === authUser.id || m.userId === authUser.id)) ||
          (currentUserId && (m.id === currentUserId || m.userId === currentUserId))
      );

      // 2. Email match
      if (!match && authUser?.email) {
        match = trip.members.find(
          (m) => m.email && m.email.trim().toLowerCase() === authUser.email.trim().toLowerCase()
        );
      }

      // 3. Name match (case-insensitive, e.g. "Ayan roy")
      if (!match && effectiveName) {
        match = trip.members.find(
          (m) => m.name && m.name.trim().toLowerCase() === effectiveName.trim().toLowerCase()
        );
      }

      // 4. Trip Owner fallback
      if (!match && trip.ownerId && (trip.ownerId === effectiveUid || (authUser?.id && trip.ownerId === authUser.id))) {
        match = trip.members.find((m) => m.role === "owner");
      }

      if (match) {
        return {
          ...match,
          userId: match.userId || authUser?.id || effectiveUid,
        };
      }
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

  // Active expenses
  const activeExpenses = useMemo(
    () => (trip?.expenses || []).filter((e) => !e.deleted),
    [trip?.expenses]
  );

  // Total trip spent
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
    return simplifyDebts(netBalances, trip?.members || []);
  }, [netBalances, trip?.members]);

  // User Stats
  const userStats = useMemo(() => {
    const candidateKeys = [
      currentUser.id,
      currentUser.userId,
      authUser?.id,
      currentUserId,
    ].filter(Boolean) as string[];

    let ps = { paid: 0, share: 0 };
    let net = 0;

    for (const key of candidateKeys) {
      if (paidShare[key] && (paidShare[key].paid > 0 || paidShare[key].share > 0)) {
        ps = paidShare[key];
        break;
      }
    }
    if (!ps.paid && !ps.share) {
      for (const key of candidateKeys) {
        if (paidShare[key]) {
          ps = paidShare[key];
          break;
        }
      }
    }

    for (const key of candidateKeys) {
      if (netBalances[key] !== undefined) {
        net = netBalances[key];
        break;
      }
    }

    return {
      paid: ps.paid,
      share: ps.share,
      net,
    };
  }, [paidShare, netBalances, currentUser, authUser?.id, currentUserId]);

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

  return {
    isHydrated,
    trips,
    setTrips,
    activeTripId,
    setActiveTripId,
    currentUserId,
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
  };
}
