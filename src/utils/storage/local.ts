import { Trip, Member, UserAccount } from "../../types";
import { isUserAuthorizedForTrip } from "./mappers";
import { saveTripToDatabase, getAllTripsFromDatabase } from "./trips";

const STORAGE_KEY_PREFIX = "trip_expense_splitter_state_v5_";
const LEGACY_STORAGE_KEY = "trip_expense_splitter_state_v4";

export interface AppState {
  trips: Trip[];
  activeTripId: string;
  currentUserId: string;
}

export function loadUserLocalState(userId: string): { trips: Trip[]; activeTripId: string } {
  if (!userId || typeof window === "undefined") {
    return { trips: [], activeTripId: "" };
  }

  try {
    const userStorageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    const raw = localStorage.getItem(userStorageKey);

    if (raw) {
      const parsed = JSON.parse(raw) as { trips?: Trip[]; activeTripId?: string };
      if (parsed && Array.isArray(parsed.trips)) {
        const authorizedTrips = parsed.trips.filter((t) => isUserAuthorizedForTrip(t, userId));
        return {
          trips: authorizedTrips,
          activeTripId: parsed.activeTripId || (authorizedTrips[0]?.id ?? ""),
        };
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as { trips?: Trip[] };
      if (parsed && Array.isArray(parsed.trips)) {
        const authorizedTrips = parsed.trips.filter((t) => isUserAuthorizedForTrip(t, userId));
        if (authorizedTrips.length > 0) {
          saveUserLocalState(userId, {
            trips: authorizedTrips,
            activeTripId: authorizedTrips[0].id,
          });
        }
        return {
          trips: authorizedTrips,
          activeTripId: authorizedTrips[0]?.id ?? "",
        };
      }
    }
  } catch (e) {
    console.warn("Could not read user local cache:", e);
  }

  return { trips: [], activeTripId: "" };
}

export function saveUserLocalState(
  userId: string,
  state: { trips: Trip[]; activeTripId: string }
): void {
  if (!userId || typeof window === "undefined") return;

  try {
    const userStorageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    const authorizedTrips = state.trips.filter((t) => isUserAuthorizedForTrip(t, userId));
    localStorage.setItem(
      userStorageKey,
      JSON.stringify({
        trips: authorizedTrips,
        activeTripId: state.activeTripId,
      })
    );
  } catch (e) {
    console.warn("Could not save user local cache:", e);
  }
}

export function clearUserLocalState(userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`);
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    console.warn("Could not clear user local cache:", e);
  }
}

export function loadState(): AppState {
  if (typeof window === "undefined") {
    return { trips: [], activeTripId: "", currentUserId: "" };
  }
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      if (parsed && Array.isArray(parsed.trips)) {
        return {
          trips: parsed.trips,
          activeTripId: parsed.activeTripId || "",
          currentUserId: parsed.currentUserId || "",
        };
      }
    }
  } catch (e) {
    console.warn("Could not read legacy local cache:", e);
  }

  return {
    trips: [],
    activeTripId: "",
    currentUserId: "",
  };
}

export function saveState(state: AppState): void {
  if (state.currentUserId) {
    saveUserLocalState(state.currentUserId, {
      trips: state.trips,
      activeTripId: state.activeTripId,
    });
  }
}

export async function exportBackupJSON(trip?: Trip): Promise<void> {
  let dataToExport: Trip | { trips: Trip[] } | undefined = trip;
  if (!dataToExport) {
    const trips = await getAllTripsFromDatabase();
    dataToExport = { trips };
  }
  const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `splittrip-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportExpensesCSV(trip: Trip): void {
  const activeExpenses = trip.expenses.filter((e) => !e.deleted);
  const memberMap = Object.fromEntries(trip.members.map((m) => [m.id, m.name]));

  const headers = [
    "Title",
    "Category",
    "Date",
    "Amount",
    "Currency",
    "Paid By",
    "Split Method",
    "Participants",
    "Notes",
  ];
  const rows = activeExpenses.map((e) => [
    `"${(e.title || "").replace(/"/g, '""')}"`,
    e.category,
    e.date,
    e.amount.toFixed(2),
    trip.currency,
    `"${(memberMap[e.paidBy] || e.paidBy).replace(/"/g, '""')}"`,
    e.method,
    `"${e.participants.map((id) => memberMap[id] || id).join(", ")}"`,
    `"${(e.notes || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.title.toLowerCase().replace(/\s+/g, "-")}-expenses-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateInviteLink(trip: Trip): string {
  const baseUrl = window.location.origin + window.location.pathname;
  const code = trip.inviteCode || trip.id;
  return `${baseUrl}#join?code=${encodeURIComponent(code)}`;
}

export function generateTripDeepLink(tripId: string): string {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#/trip/${encodeURIComponent(tripId)}`;
}

export function createCleanInitialTrip(user: {
  id: string;
  name: string;
  email?: string;
  avatarColor?: string;
  phone?: string;
}): Trip {
  const today = new Date().toISOString().split("T")[0];
  const tripId = `trip_${Date.now()}`;
  const inviteCode = `TRIP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const ownerMember: Member = {
    id: user.id,
    tripId,
    userId: user.id,
    name: user.name || "Traveler",
    role: "admin",
    avatarColor: user.avatarColor || "#0F6B65",
    phone: user.phone,
    email: user.email,
    joinedAt: new Date().toISOString(),
    status: "active",
  };

  const emptyTrip: Trip = {
    id: tripId,
    title: "My New Trip",
    location: "Destination",
    destination: "Destination",
    startDate: today,
    endDate: today,
    currency: "INR",
    status: "ACTIVE",
    ownerId: user.id,
    ownerName: user.name || "Traveler",
    memberUserIds: [user.id],
    inviteCode,
    createdAt: new Date().toISOString(),
    members: [ownerMember],
    expenses: [],
    payments: [],
    activities: [
      {
        id: `act_${Date.now()}`,
        ts: "Just now",
        user: user.name || "Traveler",
        action: "created the trip",
        detail: "My New Trip",
      },
    ],
  };

  saveTripToDatabase(emptyTrip).catch((err) => {
    console.warn("Could not persist initial trip immediately:", err);
  });
  return emptyTrip;
}

export const DEFAULT_AUTH_USER: UserAccount = {
  id: "user_default",
  name: "Traveler",
  email: "traveler@splittrip.local",
  avatarColor: "#0F6B65",
  createdAt: new Date().toISOString(),
};

export function resetStorageState(
  _mode: "clean_scratch",
  user: UserAccount = DEFAULT_AUTH_USER
): { trips: Trip[]; activeTripId: string } {
  clearUserLocalState(user.id);
  const initialTrip = createCleanInitialTrip(user);
  const freshState = {
    trips: [initialTrip],
    activeTripId: initialTrip.id,
  };
  saveUserLocalState(user.id, freshState);
  return freshState;
}
