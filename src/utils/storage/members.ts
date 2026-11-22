import { Member, Payment, Activity } from "../../types";
import {
  enqueueMutation,
  getAuthHeaders,
  getApiUrl,
  handleApiUnauthorized,
  notifyTripMutated,
} from "../offlineSync";

export async function recordPaymentAtomic(
  tripId: string,
  payment: Payment,
  activity?: Activity
): Promise<void> {
  if (!tripId || !payment) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        ...payment,
        activity,
      }),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("RECORD_PAYMENT", tripId, { ...payment, activity });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error in recordPaymentAtomic, queueing offline mutation:", err);
    enqueueMutation("RECORD_PAYMENT", tripId, { ...payment, activity });
  }
}

export async function confirmPaymentAtomic(
  tripId: string,
  paymentId: string,
  confirmedBy: string,
  activity?: Activity
): Promise<void> {
  if (!tripId || !paymentId) return;

  const payload = {
    id: paymentId,
    status: "confirmed",
    confirmedBy,
    confirmedAt: new Date().toISOString(),
    activity,
  };

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments/${encodeURIComponent(paymentId)}`),
      {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("RECORD_PAYMENT", tripId, payload);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error in confirmPaymentAtomic, queueing offline mutation:", err);
    enqueueMutation("RECORD_PAYMENT", tripId, payload);
  }
}

export async function addPaymentToDatabase(tripId: string, payment: Payment): Promise<void> {
  if (!tripId || !payment) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(payment),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("RECORD_PAYMENT", tripId, payment);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error adding payment, queueing offline mutation:", err);
    enqueueMutation("RECORD_PAYMENT", tripId, payment);
  }
}

export async function updatePaymentInDatabase(tripId: string, payment: Payment): Promise<void> {
  if (!tripId || !payment) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments/${encodeURIComponent(payment.id)}`),
      {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify(payment),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("RECORD_PAYMENT", tripId, payment);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error updating payment, queueing offline mutation:", err);
    enqueueMutation("RECORD_PAYMENT", tripId, payment);
  }
}

export async function deletePaymentFromDatabase(tripId: string, paymentId: string): Promise<void> {
  if (!tripId || !paymentId) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/payments/${encodeURIComponent(paymentId)}`),
      {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ paymentId }),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("DELETE_PAYMENT", tripId, { paymentId });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error deleting payment, queueing offline mutation:", err);
    enqueueMutation("DELETE_PAYMENT", tripId, { paymentId });
  }
}

export async function addMemberToDatabase(tripId: string, member: Member): Promise<Member> {
  if (!tripId || !member) return member;

  const fallbackMember: Member = {
    ...member,
    userId: member.userId || member.id,
  };

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/trip_members`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(fallbackMember),
    });

    if (handleApiUnauthorized(res)) {
      return fallbackMember;
    }

    if (res.ok) {
      const data = (await res.json()) as { member?: Member & { user_id?: string } };
      notifyTripMutated(tripId);
      if (data?.member) {
        return {
          ...fallbackMember,
          ...data.member,
          userId: data.member.userId || data.member.user_id || fallbackMember.userId,
        };
      }
      return fallbackMember;
    }

    if (res.status >= 500) {
      enqueueMutation("SAVE_MEMBER", tripId, fallbackMember);
    }
  } catch (err) {
    console.warn("Network error adding member, queueing offline mutation:", err);
    enqueueMutation("SAVE_MEMBER", tripId, fallbackMember);
  }

  return fallbackMember;
}

export async function updateMemberInDatabase(tripId: string, member: Member): Promise<void> {
  if (!tripId || !member) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/trip_members/${encodeURIComponent(member.id)}`),
      {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify(member),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_MEMBER", tripId, member);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error updating member, queueing offline mutation:", err);
    enqueueMutation("SAVE_MEMBER", tripId, member);
  }
}

export async function deleteMemberFromDatabase(tripId: string, memberId: string): Promise<void> {
  if (!tripId || !memberId) return;

  try {
    const res = await fetch(
      getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/trip_members/${encodeURIComponent(memberId)}`),
      {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ memberId }),
      }
    );

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("DELETE_MEMBER", tripId, { memberId });
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error deleting member, queueing offline mutation:", err);
    enqueueMutation("DELETE_MEMBER", tripId, { memberId });
  }
}

export async function addActivityToDatabase(tripId: string, activity: Activity): Promise<void> {
  if (!tripId || !activity) return;

  try {
    const res = await fetch(getApiUrl(`/api/trips/${encodeURIComponent(tripId)}/activities`), {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(true),
      body: JSON.stringify(activity),
    });

    if (handleApiUnauthorized(res)) {
      return;
    }

    if (!res.ok) {
      if (res.status >= 500) {
        enqueueMutation("SAVE_ACTIVITY", tripId, activity);
      }
      return;
    }

    notifyTripMutated(tripId);
  } catch (err) {
    console.warn("Network error adding activity, queueing offline mutation:", err);
    enqueueMutation("SAVE_ACTIVITY", tripId, activity);
  }
}

export const addPaymentToFirestore = addPaymentToDatabase;
export const updatePaymentInFirestore = updatePaymentInDatabase;
export const deletePaymentFromFirestore = deletePaymentFromDatabase;
export const addMemberToFirestore = addMemberToDatabase;
export const updateMemberInFirestore = updateMemberInDatabase;
export const deleteMemberFromFirestore = deleteMemberFromDatabase;
export const addActivityToFirestore = addActivityToDatabase;
