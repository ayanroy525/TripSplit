import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { C, PRESET_AVATAR_PALETTE } from "../utils/constants";
import { ThemeToggle } from "./ThemeToggle";
import {
  User,
  Mail,
  Phone,
  LogOut,
  X,
  Check,
  Edit3,
  Shield,
  Trash2,
  Calendar,
} from "lucide-react";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAuthPage: () => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  onOpenAuthPage,
}: UserProfileModalProps) {
  const {
    currentUser,
    updateProfile,
    logout,
  } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [phone, setPhone] = useState(currentUser?.phone || "");
  const [avatarColor, setAvatarColor] = useState(
    currentUser?.avatarColor || "#E39A2D"
  );
  const [bio, setBio] = useState(currentUser?.bio || "");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !currentUser) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    updateProfile({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      avatarColor,
      bio: bio.trim() || undefined,
    });

    setIsEditing(false);
    setSuccessMsg("Profile updated successfully!");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleLogout = () => {
    logout();
    onClose();
    onOpenAuthPage();
  };

  return (
    <div
      id="modal-user-profile"
      className="fixed inset-0 bg-[var(--c-ink)]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--c-paperDark)] border border-[var(--c-line)] rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-[var(--c-line)] flex items-center justify-between bg-[var(--c-card)]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--c-teal-contrast-text)] text-lg font-bold shadow-xs"
              style={{ background: currentUser.avatarColor }}
            >
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--c-ink)] leading-tight">
                {currentUser.name}
              </h2>
              <p className="text-xs text-[var(--c-inkSoft)]">
                {currentUser.email}
              </p>
            </div>
          </div>

          <button
            id="btn-close-profile-modal"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-[var(--c-line)] bg-[var(--c-card)] text-[var(--c-inkSoft)] hover:text-[var(--c-ink)] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-emerald-800 text-xs font-semibold">
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {!isEditing ? (
            <div className="flex flex-col gap-4">
              {/* Profile Details Card */}
              <div className="bg-[var(--c-card)] border border-[var(--c-line)] rounded-xl p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--c-inkSoft)]">
                    Account Info
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setName(currentUser.name);
                      setEmail(currentUser.email);
                      setPhone(currentUser.phone || "");
                      setAvatarColor(currentUser.avatarColor);
                      setBio(currentUser.bio || "");
                      setIsEditing(true);
                    }}
                    className="text-xs font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 size={13} />
                    <span>Edit Profile</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="text-xs text-[var(--c-inkSoft)] font-medium">
                      Mobile Number
                    </div>
                    <div className="text-sm text-[var(--c-ink)] font-semibold mt-0.5">
                      {currentUser.phone || "Not set"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-[var(--c-inkSoft)] font-medium">
                      Account Status
                    </div>
                    <div className="text-sm text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
                      <Shield size={14} />
                      <span>Active Verified</span>
                    </div>
                  </div>
                </div>

                {currentUser.bio && (
                  <div className="border-t border-[var(--c-lineSoft)] pt-2.5">
                    <div className="text-xs text-[var(--c-inkSoft)] font-medium">
                      Travel Bio / Role
                    </div>
                    <div className="text-sm text-[var(--c-ink)] italic mt-0.5">
                      "{currentUser.bio}"
                    </div>
                  </div>
                )}
              </div>

              {/* App Theme Setting */}
              <div className="bg-[var(--c-card)] border border-[var(--c-line)] rounded-xl p-4 flex items-center justify-between shadow-xs">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[var(--c-ink)]">
                    App Theme
                  </div>
                  <div className="text-[11px] text-[var(--c-inkSoft)] mt-0.5">
                    Toggle light or dark appearance
                  </div>
                </div>
                <ThemeToggle />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  id="btn-logout"
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 text-xs font-semibold text-[var(--c-rust)] hover:bg-[var(--c-rustSoft)] border border-[var(--c-rust)] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Log Out</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-[var(--c-inkSoft)] bg-[var(--c-card)] hover:bg-[var(--c-lineSoft)] border border-[var(--c-line)] rounded-lg transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[var(--c-card)] border border-[var(--c-line)] rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[var(--c-card)] border border-[var(--c-line)] rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 text-sm bg-[var(--c-card)] border border-[var(--c-line)] rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1">
                  Travel Bio / Role
                </label>
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. Organizer, Driver, Budget Master"
                  className="w-full px-3 py-2 text-sm bg-[var(--c-card)] border border-[var(--c-line)] rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--c-inkSoft)] mb-1.5">
                  Avatar Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_AVATAR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAvatarColor(color)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        avatarColor === color ? "scale-115 ring-2 ring-stone-900" : "hover:scale-105"
                      }`}
                      style={{ background: color }}
                    >
                      {avatarColor === color && <Check size={12} className="text-[var(--c-teal-contrast-text)]" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--c-line)]">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-semibold text-[var(--c-inkSoft)] hover:bg-[var(--c-line)] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-[var(--c-teal-contrast-text)] bg-[var(--c-ink)] hover:bg-[var(--c-inkSoft)] rounded-lg cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
