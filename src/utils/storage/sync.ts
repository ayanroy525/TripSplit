import { Trip } from "../../types";
import { getAuthHeaders, getApiUrl, handleApiUnauthorized } from "../offlineSync";
import { ServerTripPayload, mapServerTripToClientTrip } from "./mappers";
import { getTripFromDatabase, getAllTripsFromDatabase } from "./trips";
import { loadUserLocalState } from "./local";

export function subscribeToTrip(
  tripId: string,
  onTripUpdate: (trip: Trip | null) => void,
  onError?: (err: Error) => void
): () => void {
  if (!tripId) return () => {};

  let isDisposed = false;
  let isFetching = false;

  const fetchLatest = async () => {
    if (isDisposed || isFetching) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    isFetching = true;
    try {
      const trip = await getTripFromDatabase(tripId);
      if (!isDisposed) {
        onTripUpdate(trip);
      }
    } catch (err: unknown) {
      if (!isDisposed && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      isFetching = false;
    }
  };

  fetchLatest();

  const pollTimer = setInterval(fetchLatest, 12000);

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      fetchLatest();
    }
  };

  const onTripMutated = (e: Event) => {
    const customEvent = e as CustomEvent<{ tripId?: string }>;
    if (!customEvent.detail?.tripId || customEvent.detail.tripId === tripId) {
      fetchLatest();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("tripsplit:trip-mutated", onTripMutated);
  }

  return () => {
    isDisposed = true;
    clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("tripsplit:trip-mutated", onTripMutated);
    }
  };
}

export function subscribeToUserTrips(
  userId: string,
  onTripsUpdate: (trips: Trip[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!userId || userId.startsWith("guest_")) {
    if (!userId) onTripsUpdate([]);
    return () => {};
  }

  let isDisposed = false;
  let isFetching = false;

  const fetchUserTrips = async () => {
    if (isDisposed || isFetching) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    isFetching = true;
    try {
      const apiRes = await fetch(getApiUrl("/api/user-trips"), {
        credentials: "include",
        headers: getAuthHeaders(false),
      });

      if (handleApiUnauthorized(apiRes)) {
        return;
      }

      if (apiRes.ok) {
        const ct = apiRes.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const json = (await apiRes.json()) as { success?: boolean; trips?: ServerTripPayload[] };
          if (json.success && Array.isArray(json.trips)) {
            const mappedTrips: Trip[] = json.trips.map((t) => mapServerTripToClientTrip(t));
            if (!isDisposed) {
              onTripsUpdate(mappedTrips);
            }
            return;
          }
        }
      }
    } catch (err: unknown) {
      console.warn("Notice in subscribeToUserTrips, using local cache:", err);
      const cached = loadUserLocalState(userId);
      if (!isDisposed && cached.trips && cached.trips.length > 0) {
        onTripsUpdate(cached.trips);
      } else if (!isDisposed && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      isFetching = false;
    }
  };

  fetchUserTrips();

  const pollTimer = setInterval(fetchUserTrips, 12000);

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      fetchUserTrips();
    }
  };

  const onTripMutated = () => {
    fetchUserTrips();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("tripsplit:trip-mutated", onTripMutated);
  }

  return () => {
    isDisposed = true;
    clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("tripsplit:trip-mutated", onTripMutated);
    }
  };
}

export function subscribeToAllTrips(
  onTripsUpdate: (trips: Trip[]) => void,
  onError?: (err: Error) => void
): () => void {
  let isDisposed = false;
  let isFetching = false;

  const refresh = async () => {
    if (isDisposed || isFetching) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    isFetching = true;
    try {
      const trips = await getAllTripsFromDatabase();
      if (!isDisposed) {
        onTripsUpdate(trips);
      }
    } catch (err: unknown) {
      if (!isDisposed && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      isFetching = false;
    }
  };

  refresh();

  const pollTimer = setInterval(refresh, 12000);

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      refresh();
    }
  };

  const onTripMutated = () => {
    refresh();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("tripsplit:trip-mutated", onTripMutated);
  }

  return () => {
    isDisposed = true;
    clearInterval(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("tripsplit:trip-mutated", onTripMutated);
    }
  };
}
