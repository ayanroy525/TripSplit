import { Trip, UserAccount } from "../../types";
import {
  enqueueMutation,
  getAuthHeaders,
  getApiUrl,
  handleApiUnauthorized,
  notifyTripMutated,
} from "../offlineSync";
import {
  ServerTripPayload,
  mapServerTripToClientTrip,
  normalizePhone,
  normalizeInviteInput,
} from "./mappers";

export interface InviteTripPreview {
  title: string;
  name: string;
  memberCount: number;
  ownerId?: undefined;
  memberUserIds?: undefined;
  members?: undefined;
}

export async function saveTripToDatabase(trip: Trip): Promise<void> {
  if (!trip || !trip.id) return;

  try {
    const res = await fetch(getApiUrl("/api/trips"), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(trip),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_TRIP_SNAPSHOT", trip.id, trip);
      }
      return;
    }

    notifyTripMutated(trip.id);
  } catch (err) {
    console.warn("Network error saving trip to server API, queueing offline mutation:", err);
    enqueueMutation("SAVE_TRIP_SNAPSHOT", trip.id, trip);
  }
}

export const saveTripToFirestore = saveTripToDatabase;

export async function getTripFromDatabase(tripId: string): Promise<Trip | null> {
  if (!tripId) return null;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}`), {
      method: "GET",
      credentials: "include",
      headers: getAuthHeaders(false),
    });

    if (handleApiUnauthorized(res)) {
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { success?: boolean; trip?: ServerTripPayload };
      if (json.success && json.trip) {
        return mapServerTripToClientTrip(json.trip);
      }
    }
  } catch (err) {
    console.warn("Error fetching trip from /api/trips/:tripId:", err);
  }

  return null;
}

export const getTripFromFirestore = getTripFromDatabase;

export async function getAllTripsFromDatabase(): Promise<Trip[]> {
  try {
    const res = await fetch(getApiUrl("/api/user-trips"), {
      method: "GET",
      credentials: "include",
      headers: getAuthHeaders(false),
    });

    if (handleApiUnauthorized(res)) {
      return [];
    }

    if (!res.ok) {
      return [];
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { success?: boolean; trips?: ServerTripPayload[] };
      if (json.success && Array.isArray(json.trips)) {
        return json.trips.map((t) => mapServerTripToClientTrip(t));
      }
    }
  } catch (err) {
    console.warn("Error fetching trips from /api/user-trips:", err);
  }

  return [];
}

export const getAllTripsFromFirestore = getAllTripsFromDatabase;

export async function deleteTripFromDatabase(tripId: string): Promise<void> {
  if (!tripId) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}`), {
      method: "DELETE",
      credentials: "include",
      headers: getAuthHeaders(false),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("DELETE_TRIP", tripId, { tripId });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error deleting trip, queueing offline mutation:", err);
    enqueueMutation("DELETE_TRIP", tripId, { tripId });
  }
}

export const deleteTripFromFirestore = deleteTripFromDatabase;

export async function linkUserToExistingTripMembers(
  user: UserAccount
): Promise<{ linkedTripsCount: number; linkedMembersCount: number }> {
  if (!user || !user.id || user.id.startsWith("guest_")) {
    return { linkedTripsCount: 0, linkedMembersCount: 0 };
  }

  const cleanUserPhone = normalizePhone(user.phone);
  const cleanUserEmail = user.email ? user.email.trim().toLowerCase() : "";

  if (!cleanUserPhone && !cleanUserEmail) {
    return { linkedTripsCount: 0, linkedMembersCount: 0 };
  }

  try {
    const res = await fetch(getApiUrl("/api/trips/link-members"), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        name: user.name,
        email: cleanUserEmail,
        phone: user.phone || "",
      }),
    });

    if (handleApiUnauthorized(res)) {
      return { linkedTripsCount: 0, linkedMembersCount: 0 };
    }

    if (res.ok) {
      const data = (await res.json()) as { linkedTripsCount?: number; linkedMembersCount?: number };
      const linkedTripsCount = Number(data?.linkedTripsCount || 0);
      const linkedMembersCount = Number(data?.linkedMembersCount || 0);
      if (linkedMembersCount > 0) {
        notifyTripMutated();
      }
      return { linkedTripsCount, linkedMembersCount };
    }
  } catch (err) {
    console.warn("Error in linkUserToExistingTripMembers:", err);
  }

  return { linkedTripsCount: 0, linkedMembersCount: 0 };
}

export async function getTripByInviteCode(
  rawInput: string
): Promise<{
  success: boolean;
  trip?: InviteTripPreview;
  error?: string;
}> {
  const clean = normalizeInviteInput(rawInput);
  if (!clean) {
    return {
      success: false,
      error: "Please enter an invite code.",
    };
  }

  try {
    const apiRes = await fetch(getApiUrl("/api/trips/invite/lookup"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ inviteCode: clean }),
    });
    const ct = apiRes.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = (await apiRes.json()) as {
        success?: boolean;
        trip?: { title?: string; name?: string; memberCount?: number };
        error?: string;
      };
      if (apiRes.ok && json.success && json.trip) {
        return {
          success: true,
          trip: {
            title: json.trip.title || json.trip.name || "Untitled Trip",
            name: json.trip.name || json.trip.title || "Untitled Trip",
            memberCount: Number(json.trip.memberCount ?? 0),
          },
        };
      }
      if (apiRes.status === 404 || apiRes.status === 410 || apiRes.status === 429) {
        return {
          success: false,
          error:
            json.error ||
            `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
        };
      }
    }
  } catch (apiErr) {
    console.warn("Server invite lookup failed:", apiErr);
  }

  return {
    success: false,
    error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
  };
}

export async function joinTripByInviteCode(
  rawInput: string,
  currentUser: UserAccount
): Promise<{
  success: boolean;
  trip?: Trip;
  alreadyMember?: boolean;
  error?: string;
}> {
  const clean = normalizeInviteInput(rawInput);
  if (!clean) {
    return { success: false, error: "Please enter a valid invite code." };
  }
  if (!currentUser || !currentUser.id) {
    return { success: false, error: "Please log in before joining a trip." };
  }

  try {
    const apiRes = await fetch(getApiUrl("/api/trips/invite/join"), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        inviteCode: clean,
        user: {
          id: currentUser.id,
          name: currentUser.name || "Traveler",
          email: currentUser.email || "",
          phone: currentUser.phone || "",
          avatarColor: currentUser.avatarColor || "#0F6B65",
        },
      }),
    });

    if (handleApiUnauthorized(apiRes)) {
      return {
        success: false,
        error: "Your session has expired. Please log in again.",
      };
    }

    const ct = apiRes.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = (await apiRes.json()) as {
        success?: boolean;
        trip?: ServerTripPayload;
        alreadyMember?: boolean;
        error?: string;
      };
      if (apiRes.ok && json.success && json.trip) {
        const joinedTrip = mapServerTripToClientTrip(json.trip);
        notifyTripMutated(joinedTrip.id);
        return {
          success: true,
          alreadyMember: Boolean(json.alreadyMember),
          trip: joinedTrip,
        };
      }
      if (!apiRes.ok && json.error) {
        return {
          success: false,
          error: json.error,
        };
      }
    }
  } catch (apiErr) {
    console.warn("Server invite join error:", apiErr);
  }

  return {
    success: false,
    error: `Invite code '${clean}' is invalid or expired. Please check with your trip organizer.`,
  };
}
