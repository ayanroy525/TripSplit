import React, { useState } from "react";
import { Compass, Plus, KeyRound } from "lucide-react";
import { Trip } from "../types";
import { C } from "../utils/constants";
import { ModalShell } from "./Atoms";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { RecentTripsList } from "./trips-hub/RecentTripsList";
import { CreateTripForm } from "./trips-hub/CreateTripForm";

interface TripsHubModalProps {
  trips: Trip[];
  activeTripId: string;
  onSelectTrip: (tripId: string) => void;
  onCreateTrip: (newTrip: Trip) => void;
  onDeleteTrip: (tripId: string) => void;
  onOpenJoinModal?: () => void;
  onClose: () => void;
}

export function TripsHubModal({
  trips,
  activeTripId,
  onSelectTrip,
  onCreateTrip,
  onDeleteTrip,
  onOpenJoinModal,
  onClose,
}: TripsHubModalProps) {
  const { currentUser: authUser } = useAuth();
  const [view, setView] = useState<"recent" | "create">(trips.length === 0 ? "create" : "recent");
  const [pendingDeleteTrip, setPendingDeleteTrip] = useState<Trip | null>(null);

  return (
    <ModalShell
      title="Trips Dashboard"
      subtitle="Switch between recent trips or organize a brand new journey"
      onClose={onClose}
      width={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            background: C.paperDark,
            padding: 4,
            borderRadius: 12,
            border: `1px solid ${C.line}`,
            gap: 4,
          }}
        >
          <button
            id="tab-recent-trips"
            type="button"
            onClick={() => setView("recent")}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: view === "recent" ? C.card : "transparent",
              color: view === "recent" ? C.ink : C.inkSoft,
              fontWeight: 800,
              fontSize: 12.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: view === "recent" ? "0 2px 5px rgba(0,0,0,0.05)" : "none",
            }}
          >
            <Compass size={15} color={view === "recent" ? C.marigoldDark : C.inkSoft} />
            Recent Trips ({trips.length})
          </button>
          {onOpenJoinModal && (
            <button
              id="tab-join-invite-trip"
              type="button"
              onClick={() => {
                onClose();
                onOpenJoinModal();
              }}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: C.marigoldDark,
                fontWeight: 800,
                fontSize: 12.5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "opacity 0.15s ease",
              }}
              title="Join another trip using an invite code"
            >
              <KeyRound size={15} color={C.marigoldDark} />
              Join with Code
            </button>
          )}
          <button
            id="tab-create-new-trip"
            type="button"
            onClick={() => setView("create")}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: view === "create" ? C.card : "transparent",
              color: view === "create" ? C.teal : C.inkSoft,
              fontWeight: 800,
              fontSize: 12.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: view === "create" ? "0 2px 5px rgba(0,0,0,0.05)" : "none",
            }}
          >
            <Plus size={15} color={view === "create" ? C.teal : C.inkSoft} />
            + New Trip
          </button>
        </div>

        {view === "recent" && (
          <RecentTripsList
            trips={trips}
            activeTripId={activeTripId}
            onSelectTrip={onSelectTrip}
            onRequestDeleteTrip={setPendingDeleteTrip}
            onSwitchToCreate={() => setView("create")}
            onOpenJoinModal={onOpenJoinModal}
            onClose={onClose}
          />
        )}

        {view === "create" && (
          <CreateTripForm
            authUser={authUser}
            onCreateTrip={onCreateTrip}
            onCancel={() => setView("recent")}
            onClose={onClose}
          />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteTrip)}
        title="Delete Trip"
        message={
          pendingDeleteTrip
            ? `Are you sure you want to delete "${pendingDeleteTrip.title}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDeleteTrip(null)}
        onConfirm={() => {
          if (pendingDeleteTrip) {
            onDeleteTrip(pendingDeleteTrip.id);
          }
          setPendingDeleteTrip(null);
        }}
      />
    </ModalShell>
  );
}
