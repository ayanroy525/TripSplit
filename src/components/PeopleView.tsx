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

        <button
          id="btn-people-invite-friends"
          type="button"
          onClick={onOpenInviteModal}
          className="px-3.5 py-2 text-xs font-semibold text-[var(--c-teal-contrast-text)] bg-teal-800 hover:bg-[var(--c-teal)] rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <UserPlus size={14} />
          <span>Invite Members</span>
        </button>
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
              className={`p-4 rounded-xl border flex flex-col gap-3.5 shadow-xs transition-all ${
                isMe ? "bg-teal-50/20 border-teal-300 ring-1 ring-teal-300/50" : "bg-[var(--c-card)] border-[var(--c-line)]"
              }`}
            >
              {/* Top Row: Avatar, Name, Role badge, & IsMe tag */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar member={m} size={40} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--c-ink)]">
                        {m.name}
                      </span>
                      {isMe && (
                        <span className="text-[11px] font-medium text-[var(--c-teal)] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <RoleBadge role={m.role} />
                      {m.phone && (
                        <span className="text-xs text-[var(--c-inkSoft)]">
                          {m.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Balance Badge */}
                <div className="text-right">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-inkSoft)]">
                    Net Balance
                  </div>
                  <div
                    className={`text-sm font-bold mt-0.5 ${
                      stats.net > 0.01
                        ? "text-emerald-700"
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
              <div className="bg-[var(--c-paperDark)] rounded-lg p-2.5 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[11px] text-[var(--c-inkSoft)] font-medium">Total Paid</div>
                  <div className="text-xs font-bold text-[var(--c-ink)] mt-0.5">
                    {money(stats.paid)}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[var(--c-inkSoft)] font-medium">Trip Share</div>
                  <div className="text-xs font-bold text-[var(--c-ink)] mt-0.5">
                    {money(stats.share)}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[var(--c-inkSoft)] font-medium">Status</div>
                  <div
                    className={`text-xs font-bold mt-0.5 ${
                      stats.net > 0.01
                        ? "text-emerald-700"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
