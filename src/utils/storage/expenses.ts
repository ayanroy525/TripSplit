import { Expense, Activity } from "../../types";
import {
  enqueueMutation,
  getAuthHeaders,
  getApiUrl,
  handleApiUnauthorized,
  notifyTripMutated,
} from "../offlineSync";

export async function addExpenseToDatabase(tripId: string, expense: Expense): Promise<void> {
  if (!tripId || !expense) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/expenses`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(expense),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_EXPENSE", tripId, expense);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error adding expense, queueing offline mutation:", err);
    enqueueMutation("SAVE_EXPENSE", tripId, expense);
  }
}

export async function updateExpenseInDatabase(tripId: string, expense: Expense): Promise<void> {
  if (!tripId || !expense) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expense.id)}`),
      {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify(expense),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_EXPENSE", tripId, expense);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error updating expense, queueing offline mutation:", err);
    enqueueMutation("SAVE_EXPENSE", tripId, expense);
  }
}

export async function deleteExpenseFromDatabase(tripId: string, expenseId: string): Promise<void> {
  if (!tripId || !expenseId) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}`),
      {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ expenseId }),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("DELETE_EXPENSE", tripId, { expenseId });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error deleting expense, queueing offline mutation:", err);
    enqueueMutation("DELETE_EXPENSE", tripId, { expenseId });
  }
}

export async function saveExpenseAtomic(
  tripId: string,
  expense: Expense,
  activity?: Activity
): Promise<void> {
  if (!tripId || !expense) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/expenses`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        ...expense,
        activity,
      }),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_EXPENSE", tripId, { ...expense, activity });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error in saveExpenseAtomic, queueing offline mutation:", err);
    enqueueMutation("SAVE_EXPENSE", tripId, { ...expense, activity });
  }
}

export const addExpenseToFirestore = addExpenseToDatabase;
export const updateExpenseInFirestore = updateExpenseInDatabase;
export const deleteExpenseFromFirestore = deleteExpenseFromDatabase;
