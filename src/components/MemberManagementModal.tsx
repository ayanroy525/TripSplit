import React, { useState } from "react";
import { UserPlus, Trash2, Shield, Edit2, Check, AlertCircle, Phone, User } from "lucide-react";
import { Member, Role } from "../types";
import { C, PRESET_AVATAR_PALETTE } from "../utils/constants";
import { uid } from "../utils/calculations";
import { Avatar, ModalShell, RoleBadge } from "./Atoms";

interface MemberManagementModalProps {
  members: Member[];
  currentUserId: string;
  balances: Record<string, { paid: number; share: number }>;
  onAddMember: (newMember: Member) => void;
  onUpdateMember: (member: Member) => void;
  onRemoveMember: (memberId: string) => void;
  onOpenInvite?: () => void;
  onClose: () => void;
}

export function MemberManagementModal({
  members,
  currentUserId,
  balances,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
  onOpenInvite,
  onClose,
}: MemberManagementModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [color, setColor] = useState(PRESET_AVATAR_PALETTE[0]);
  const [phone, setPhone] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const currentUser = members.find((m) => m.id === currentUserId || m.userId === currentUserId);
  const isOwner = currentUser?.role === "owner";

  const handleCreate = () => {
    setErrorMsg("");
    if (!name.trim()) {
      setErrorMsg("Member name is required.");
      return;
    }

    const newM: Member = {
      id: uid("m"),
      userId: uid("m"),
      name: name.trim(),
      role,
      avatarColor: color,
      phone: phone.trim() || undefined,
      joinedAt: new Date().toISOString(),
      status: "active",
    };

    onAddMember(newM);
    setName("");
    setPhone("");
    setShowAddForm(false);
  };

  const startEdit = (m: Member) => {
    setEditingMemberId(m.id);
    setEditPhone(m.phone || "");
  };

  const saveEdit = (m: Member) => {
    onUpdateMember({
      ...m,
      phone: editPhone.trim() || undefined,
    });
    setEditingMemberId(null);
  };

  return (
    <ModalShell
      title="Trip Members & Roles"
      subtitle={`${members.length} people in this private travel group`}
      onClose={onClose}
      width={560}
    >
      <div className="flex flex-col gap-4">
        {errorMsg && (
          <div className="bg-[var(--c-rustSoft)] border border-[var(--c-rust)] rounded-xl p-3 text-xs font-semibold text-[var(--c-rust)] flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Member List */}
        <div className="flex flex-col gap-2.5 max-h-[340px] overflow-y-auto pr-1">
          {members.map((m) => {
            const isMe = m.id === currentUserId || m.userId === currentUserId;
            const bal = balances[m.id];
            const net = bal ? bal.paid - bal.share : 0;
            const isEditing = editingMemberId === m.id;

            return (
              <div
                key={m.id}
                className="p-3.5 bg-[var(--c-card)] border border-[var(--c-line)] rounded-xl flex flex-col gap-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar member={m} size={36} />
                    <div>
                      <div className="text-sm font-semibold text-[var(--c-ink)] flex items-center gap-2">
                        <span>{m.name}</span>
                        {isMe && (
                          <span className="text-[11px] font-medium text-[var(--c-inkSoft)] bg-[var(--c-lineSoft)] px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                        <RoleBadge role={m.role} />
                      </div>
                      <div className="text-xs text-[var(--c-inkSoft)] mt-0.5">
                        {m.phone ? `Phone: ${m.phone}` : "No contact added"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isOwner && !isMe && m.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => onRemoveMember(m.id)}
                        className="p-1.5 text-[var(--c-inkSoft)] hover:text-[var(--c-rust)] hover:bg-[var(--c-rustSoft)] rounded-lg transition-colors cursor-pointer"
                        title="Remove member"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Member Toggle / Form */}
        {showAddForm ? (
          <div className="bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-xl p-4 flex flex-col gap-3.5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--c-inkSoft)]">
              Add New Member
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1">
                Name
              </label>
              <input
                type="text"
                placeholder="e.g. Ananya"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[var(--c-card)] border border-[var(--c-line)] rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[var(--c-card)] border border-[var(--c-line)] rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full px-3 py-2 text-sm bg-[var(--c-card)] border border-[var(--c-line)] rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="member">Member (Can add & edit expenses)</option>
                  <option value="viewer">Viewer (View only)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1.5">
                Avatar Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_AVATAR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                      color === c ? "ring-2 ring-stone-900 scale-110" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--c-line)]">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-[var(--c-inkSoft)] hover:bg-[var(--c-line)] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="px-4 py-1.5 text-xs font-semibold text-[var(--c-teal-contrast-text)] bg-[var(--c-ink)] hover:bg-[var(--c-inkSoft)] rounded-lg cursor-pointer shadow-xs"
              >
                Add to Trip
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="flex-1 py-2.5 px-4 text-xs font-semibold text-[var(--c-ink)] bg-[var(--c-lineSoft)] hover:bg-[var(--c-line)] border border-[var(--c-line)] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus size={15} />
              <span>Add Member Manually</span>
            </button>

            {onOpenInvite && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInvite();
                }}
                className="py-2.5 px-4 text-xs font-semibold text-[var(--c-teal-contrast-text)] bg-teal-800 hover:bg-[var(--c-teal)] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Invite via Code</span>
              </button>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
