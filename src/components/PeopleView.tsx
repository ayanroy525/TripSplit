import React from "react";
import {
  UserPlus,
  Crown,
  Shield,
  Phone,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Trip, Member, UserAccount } from "../types";
import { C } from "../utils/constants";
import { money } from "../utils/calculations";
import { Avatar, RoleBadge } from "./Atoms";
import { getTripPermissions } from "../utils/permissions";

interface PeopleViewProps {
  trip: Trip;
  currentUser: Member;
  currentUserId: string;
  memberStats: Record<
    string,
    {
      paid: number;
      share: number;
      net: number;
    }
  >;
  onOpenInviteModal: () => void;
  onOpenEditMember?: (member: Member) => void;
  onSendWhatsAppStatement?: (member: Member) => void;
}

export function PeopleView({
  trip,
  currentUser,
  currentUserId,
  memberStats,
  onOpenInviteModal,
  onOpenEditMember,
  onSendWhatsAppStatement,
}: PeopleViewProps) {
  const permissions = getTripPermissions(trip, currentUser, currentUserId);

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header & Invite Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-ink)] tracking-tight">
            Trip Members
          </h1>
          <div className="text-xs text-[var(--c-inkSoft)]">
            {trip.members.length} participants in {trip.title}
          </div>
        </div>

        {permissions.canInviteMember && (
          <button
            id="btn-people-invite-friends"
            type="button"
            onClick={onOpenInviteModal}
            className="px-3.5 py-2 text-xs font-semibold text-[var(--c-teal-contrast-text)] bg-teal-800 hover:bg-[var(--c-teal)] rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus size={14} />
            <span>Invite Members</span>
          </button>
        )}
      </div>

      {/* Member Cards List */}
      <div className="flex flex-col gap-3">
        {trip.members.map((m) => {
          const stats = memberStats[m.id] || (m.userId ? memberStats[m.userId] : undefined) || { paid: 0, share: 0, net: 0 };
          const isMe =
            m.id === currentUserId ||
            m.id === currentUser.id ||
            (currentUser.userId && m.userId === currentUser.userId) ||
            (currentUser.name && m.name && m.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase());

          return (
            <div
              key={m.id}
              className="p-3.5 sm:p-4 rounded-2xl border flex flex-col gap-3 shadow-xs transition-all bg-[var(--c-card)]"
              style={{
                borderColor: isMe ? "var(--c-teal)" : "var(--c-line)",
              }}
            >
              {/* Top Row: Avatar, Name, Role badge, & IsMe tag */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar member={m} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-extrabold text-[var(--c-ink)] truncate">
                        {m.name}
                      </span>
                      {isMe && (
                        <span className="text-[10px] font-bold text-[var(--c-teal)] bg-[var(--c-tealSoft)] border border-[var(--c-teal)]/30 px-2 py-0.5 rounded-full shrink-0">
                          You
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <RoleBadge role={m.role} />
                      {m.phone && (
                        <span className="text-[11px] text-[var(--c-inkSoft)] truncate">
                          {m.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Balance Badge */}
                <div className="text-right shrink-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-inkSoft)]">
                    Net Balance
                  </div>
                  <div
                    className={`text-sm font-extrabold font-mono-tabular mt-0.5 ${
                      stats.net > 0.01
                        ? "text-[var(--c-positive)]"
                        : stats.net < -0.01
                        ? "text-[var(--c-rust)]"
                        : "text-[var(--c-inkSoft)]"
                    }`}
                  >
                    {stats.net > 0.01
                      ? `+${money(stats.net)}`
                      : stats.net < -0.01
                      ? `-${money(Math.abs(stats.net))}`
                      : "₹0.00"}
                  </div>
                </div>
              </div>

              {/* Financial Metrics Strip */}
              <div className="bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-xl p-2.5 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-[var(--c-inkSoft)] font-semibold uppercase">Total Paid</div>
                  <div className="text-xs font-extrabold font-mono-tabular text-[var(--c-ink)] mt-0.5">
                    {money(stats.paid)}
                  </div>
                </div>

                <div className="border-x border-[var(--c-line)] px-1">
                  <div className="text-[10px] text-[var(--c-inkSoft)] font-semibold uppercase">Trip Share</div>
                  <div className="text-xs font-extrabold font-mono-tabular text-[var(--c-ink)] mt-0.5">
                    {money(stats.share)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[var(--c-inkSoft)] font-semibold uppercase">Status</div>
                  <div
                    className={`text-xs font-extrabold mt-0.5 ${
                      stats.net > 0.01
                        ? "text-[var(--c-positive)]"
                        : stats.net < -0.01
                        ? "text-[var(--c-rust)]"
                        : "text-[var(--c-inkSoft)]"
                    }`}
                  >
                    {stats.net > 0.01
                      ? "Gets back"
                      : stats.net < -0.01
                      ? "Owes back"
                      : "Settled"}
                  </div>
                </div>
              </div>

              {/* Mobile & Desktop Quick Member Actions */}
              {(onSendWhatsAppStatement || onOpenEditMember) && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  {onSendWhatsAppStatement && (
                    <button
                      type="button"
                      onClick={() => onSendWhatsAppStatement(m)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--c-tealSoft)] text-[var(--c-teal)] border border-[var(--c-teal)]/30 hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Share Statement
                    </button>
                  )}
                  {onOpenEditMember && permissions.isAdmin && (
                    <button
                      type="button"
                      onClick={() => onOpenEditMember(m)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--c-paperDark)] text-[var(--c-inkSoft)] hover:text-[var(--c-ink)] border border-[var(--c-line)] transition-colors cursor-pointer"
                    >
                      Manage
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
