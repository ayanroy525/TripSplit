import React, { createContext, useContext, useState, useEffect } from "react";
import { UserAccount } from "../types";
import { supabase } from "../utils/supabaseClient";
import { linkUserToExistingTripMembers, isPhoneMatch, isEmailMatch } from "../utils/storage";

interface AuthContextType {
  currentUser: UserAccount | null;
  accounts: UserAccount[];
  isAuthenticated: boolean;
  token: string | null;
  isPasswordRecovery: boolean;
  setIsPasswordRecovery: (val: boolean) => void;
  login: (
    emailOrName: string,
    password?: string
  ) => Promise<{ success: boolean; error?: string; isEmailNotConfirmed?: boolean; user?: UserAccount }>;
  signup: (
    accountData: Omit<UserAccount, "id" | "createdAt">
  ) => Promise<{ success: boolean; error?: string; requiresConfirmation?: boolean }>;
  resendConfirmationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  sendPasswordReset: (
    email: string
  ) => Promise<{ success: boolean; error?: string; errorCode?: string; rawError?: any }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (updatedData: Partial<UserAccount>) => Promise<void>;
  deleteAccount: (userId: string) => void;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function buildUserFromSupabase(user: any, extraProfile?: Partial<UserAccount>): UserAccount {
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    name: extraProfile?.name || meta.name || user.email?.split("@")[0] || "Traveler",
    email: user.email || "",
    phone: extraProfile?.phone || meta.phone || undefined,
    avatarColor: extraProfile?.avatarColor || meta.avatarColor || "#0F6B65",
    avatarUrl: extraProfile?.avatarUrl || meta.avatarUrl || undefined,
    bio: extraProfile?.bio || meta.bio || "Travel Enthusiast",
    createdAt: user.created_at || new Date().toISOString(),
  };
}

export interface LocalStoredUserRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
}

const LOCAL_USERS_DB_KEY = "trip_expense_splitter_registered_users_v2";
const ACTIVE_USER_KEY = "trip_expense_splitter_active_user_v1";

export function getLocalRegisteredUsers(): LocalStoredUserRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_USERS_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export function saveLocalRegisteredUser(user: LocalStoredUserRecord) {
  if (typeof window === "undefined") return;
  try {
    const users = getLocalRegisteredUsers();
    const existingIdx = users.findIndex(
      (u) =>
        u.id === user.id ||
        (u.email && user.email && u.email.trim().toLowerCase() === user.email.trim().toLowerCase()) ||
        (u.phone && user.phone && isPhoneMatch(u.phone, user.phone))
    );
    if (existingIdx >= 0) {
      users[existingIdx] = { ...users[existingIdx], ...user };
    } else {
      users.push(user);
    }
    localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));
  } catch (e) {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {

  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("trip_expense_splitter_auth_token_v1");
      } catch {}
    }
    return null;
  });
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(ACTIVE_USER_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (e) {}
    }
    return null;
  });
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      return hash.includes("type=recovery") || hash.includes("access_token=");
    }
    return false;
  });
  const [profileToast, setProfileToast] = useState<string | null>(null);

  const persistUser = (user: UserAccount | null) => {
    setCurrentUser(user);
    if (typeof window !== "undefined") {
      try {
        if (user) {
          localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
          linkUserToExistingTripMembers(user).catch(() => {});
        } else {
          localStorage.removeItem(ACTIVE_USER_KEY);
          localStorage.removeItem("trip_expense_splitter_auth_token_v1");
        }
      } catch (e) {}
    }
  };

  // Listen to Supabase Auth state changes
  useEffect(() => {
    // 1. Check if arriving via password recovery link
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setIsPasswordRecovery(true);
    }

    // 2. Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const existingServerToken =
          typeof window !== "undefined" ? localStorage.getItem("trip_expense_splitter_auth_token_v1") : null;
        if (!existingServerToken) {
          setTokenState(session.access_token);
        }

        let extraProfile: Partial<UserAccount> | undefined;
        try {
          const { data: profileRow } = await supabase
            .from("users")
            .select("id, name, email, phone, avatar_color, avatar_url, bio, created_at")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profileRow) {
            extraProfile = {
              name: profileRow.name,
              phone: profileRow.phone,
              avatarColor: profileRow.avatar_color,
              avatarUrl: profileRow.avatar_url,
              bio: profileRow.bio,
            };
          }
        } catch (e) {}

        const userAccount = buildUserFromSupabase(session.user, extraProfile);
        persistUser(userAccount);
        setAccounts((prev) => [userAccount, ...prev.filter((a) => a.id !== userAccount.id)]);
      }
    });

    // 3. Auth state subscription
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }

      if (session?.user) {
        const existingServerToken =
          typeof window !== "undefined" ? localStorage.getItem("trip_expense_splitter_auth_token_v1") : null;
        if (!existingServerToken) {
          setTokenState(session.access_token);
        }

        let extraProfile: Partial<UserAccount> | undefined;
        try {
          const { data: profileRow } = await supabase
            .from("users")
            .select("id, name, email, phone, avatar_color, avatar_url, bio, created_at")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profileRow) {
            extraProfile = {
              name: profileRow.name,
              phone: profileRow.phone,
              avatarColor: profileRow.avatar_color,
              avatarUrl: profileRow.avatar_url,
              bio: profileRow.bio,
            };
          }
        } catch (e) {}

        const userAccount = buildUserFromSupabase(session.user, extraProfile);
        persistUser(userAccount);
        setAccounts((prev) => [userAccount, ...prev.filter((a) => a.id !== userAccount.id)]);
      } else {
        if (typeof window !== "undefined" && !localStorage.getItem(ACTIVE_USER_KEY)) {
          setCurrentUser(null);
          setTokenState(null);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Listen for 401 Unauthorized API responses: show a clear error toast and log the user out cleanly
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnauthorized = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      const msg =
        customEvent.detail?.message || "Your session has expired (401). Please log in again.";
      setProfileToast(msg);
      setTimeout(() => setProfileToast(null), 5000);
      logout();
    };
    window.addEventListener("tripsplit:unauthorized", onUnauthorized);
    return () => {
      window.removeEventListener("tripsplit:unauthorized", onUnauthorized);
    };
  }, []);

  // Login supporting Email and Phone via server-mediated /api/auth/login
  const login = async (
    emailOrPhone: string,
    password?: string
  ): Promise<{ success: boolean; error?: string; isEmailNotConfirmed?: boolean; user?: UserAccount }> => {
    const rawInput = emailOrPhone.trim();
    if (!rawInput) {
      return { success: false, error: "Please enter your email address or phone number." };
    }
    if (!password) {
      return { success: false, error: "Please enter your password." };
    }

    let serverErrorMsg = "";
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrPhone: rawInput, password }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const resData = await response.json();
        if (response.ok && resData.success && resData.user) {
          const userAccount: UserAccount = resData.user;
          if (resData.token) {
            setTokenState(resData.token);
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("trip_expense_splitter_auth_token_v1", resData.token);
              } catch {}
            }
          }
          persistUser(userAccount);
          setAccounts((prev) => [userAccount, ...prev.filter((a) => a.id !== userAccount.id)]);

          return { success: true, user: userAccount };
        }
        serverErrorMsg = resData.error || "Invalid credentials. Please verify your email/phone and password.";
        return {
          success: false,
          error: serverErrorMsg,
        };
      }
    } catch (apiErr) {
      console.warn("Backend auth endpoint unreachable:", apiErr);
      return {
        success: false,
        error: "Unable to sign in. Please verify your credentials or try again.",
      };
    }

    return {
      success: false,
      error: serverErrorMsg || "Unable to sign in. Please verify your credentials or create an account.",
    };
  };

  // Instant Account Creation - Server-side authoritative signup with duplicate checks & rate limiting
  const signup = async (
    accountData: Omit<UserAccount, "id" | "createdAt">
  ): Promise<{ success: boolean; error?: string; requiresConfirmation?: boolean }> => {
    const trimmedEmail = accountData.email.trim().toLowerCase();
    const trimmedName = accountData.name.trim();
    const rawPhone = accountData.phone ? accountData.phone.trim() : "";
    const cleanPhoneDigits = rawPhone.replace(/\D/g, "");

    if (!trimmedName) {
      return { success: false, error: "Please enter your full name." };
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (!accountData.password || accountData.password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters long." };
    }

    // 1. Primary Signup via secure server backend (/api/auth/signup)
    // Server enforces IP rate limits, validates input, checks for email/phone duplication, and hashes password using bcrypt
    let serverResData: any = null;
    try {
      const serverRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          phone: rawPhone || undefined,
          password: accountData.password,
          avatarColor: accountData.avatarColor,
          bio: accountData.bio,
        }),
      });

      const contentType = serverRes.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        serverResData = await serverRes.json();
      }

      if (!serverRes.ok) {
        return {
          success: false,
          error:
            serverResData?.error ||
            (serverRes.status === 409
              ? "An account with this email or phone already exists. Please log in with your password."
              : serverRes.status === 429
              ? "Too many registration attempts. Please wait before trying again."
              : "Registration failed. Please verify your details and try again."),
        };
      }
    } catch (apiErr) {
      console.warn("Backend auth signup endpoint unreachable, checking offline store:", apiErr);
      // Offline fallback: check local storage only
      const localUsers = getLocalRegisteredUsers();
      const existingLocalEmail = localUsers.find((u) => u && isEmailMatch(u.email, trimmedEmail));
      if (existingLocalEmail) {
        return {
          success: false,
          error: "An account with this email already exists. Please log in with your password.",
        };
      }
      if (cleanPhoneDigits.length >= 7) {
        const existingLocalPhone = localUsers.find(
          (u) => u && u.phone && isPhoneMatch(u.phone, rawPhone)
        );
        if (existingLocalPhone) {
          return {
            success: false,
            error: "An account with this phone number already exists. Please log in with your password.",
          };
        }
      }
    }

    // Best-effort Supabase Auth registration if configured (does not block if fails)
    let supabaseUserId: string | null = null;
    let supabaseSessionToken: string | null = null;
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: accountData.password,
        options: {
          data: {
            name: trimmedName,
            phone: rawPhone || "",
            avatarColor: accountData.avatarColor || "#E39A2D",
            bio: accountData.bio || "Travel Enthusiast",
          },
        },
      });
      if (!error && data?.user) {
        supabaseUserId = data.user.id;
        if (data.session) {
          supabaseSessionToken = data.session.access_token;
        }
      }
    } catch (err) {
      console.warn("Supabase signup attempt notice:", err);
    }

    const userId =
      serverResData?.user?.id ||
      supabaseUserId ||
      `u_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;

    const newAccount: UserAccount = {
      id: userId,
      name: trimmedName,
      email: trimmedEmail,
      phone: rawPhone || undefined,
      avatarColor: accountData.avatarColor || "#E39A2D",
      bio: accountData.bio || "Travel Enthusiast",
      createdAt: serverResData?.user?.createdAt || new Date().toISOString(),
    };

    if (serverResData?.token) {
      setTokenState(serverResData.token);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("trip_expense_splitter_auth_token_v1", serverResData.token);
        } catch {}
      }
    } else if (supabaseSessionToken) {
      setTokenState(supabaseSessionToken);
    }

    // Save to local registered users store (NO sensitive password hashes stored on client)
    saveLocalRegisteredUser({
      id: userId,
      name: trimmedName,
      email: trimmedEmail,
      phone: rawPhone || undefined,
      avatarColor: accountData.avatarColor || "#E39A2D",
      bio: accountData.bio || "Travel Enthusiast",
      createdAt: newAccount.createdAt,
    });

    // Persist active session and update state
    persistUser(newAccount);
    setAccounts((prev) => [newAccount, ...prev.filter((a) => a.id !== newAccount.id)]);

    // Smart User-Member Linking: Connect any existing trips where organizer added this phone or email
    try {
      await linkUserToExistingTripMembers(newAccount);
    } catch (e) {
      console.warn("Smart User-Member Linking notice during signup:", e);
    }

    return { success: true, requiresConfirmation: false };
  };

  // Resend confirmation email via Supabase
  const resendConfirmationEmail = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: trimmedEmail,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to resend confirmation email.",
      };
    }
  };

  // Send password reset email via Supabase
  const sendPasswordReset = async (
    email: string
  ): Promise<{ success: boolean; error?: string; errorCode?: string; rawError?: any }> => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      return { success: false, error: "Please enter your email address." };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: window.location.origin,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          errorCode: error.code || "RESET_ERROR",
          rawError: error,
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to send reset email.",
        rawError: err,
      };
    }
  };

  // Update password (for password recovery or user settings)
  const updatePassword = async (
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: "Password must be at least 6 characters long." };
    }

    let supabaseAccessToken = "";
    let supabaseEmail = currentUser?.email || "";
    let supabaseUpdated = false;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        supabaseAccessToken = sessionData.session.access_token;
      }
      if (sessionData?.session?.user?.email) {
        supabaseEmail = sessionData.session.user.email;
      }

      const { data: updateData, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (!error) {
        supabaseUpdated = true;
        if (updateData?.user?.email) {
          supabaseEmail = updateData.user.email;
        }
      } else if (!token && !supabaseAccessToken) {
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      if (!token && !supabaseAccessToken) {
        return { success: false, error: err?.message || "Failed to update password." };
      }
    }

    // Also synchronize the bcrypt password_hash and token_version in PostgreSQL public.users
    try {
      const activeBearer =
        token ||
        supabaseAccessToken ||
        (typeof window !== "undefined" ? localStorage.getItem("trip_expense_splitter_auth_token_v1") || "" : "");

      const resp = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeBearer ? { Authorization: `Bearer ${activeBearer}` } : {}),
        },
        body: JSON.stringify({
          action: "update-password",
          newPassword,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data?.token) {
          setTokenState(data.token);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("trip_expense_splitter_auth_token_v1", data.token);
            } catch {}
          }
        }
      } else if (!supabaseUpdated) {
        const errData = await resp.json().catch(() => ({}));
        return {
          success: false,
          error: errData?.error || "Failed to update password on server.",
        };
      }
    } catch (syncErr: any) {
      if (!supabaseUpdated) {
        return {
          success: false,
          error: syncErr?.message || "Network error while updating password.",
        };
      }
    }

    setIsPasswordRecovery(false);
    // Clean up URL hash
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    return { success: true };
  };

  // Logout handler - thoroughly purge all session tokens and caches
  const logout = () => {
    supabase.auth.signOut().catch(() => {});
    persistUser(null);
    setTokenState(null);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(ACTIVE_USER_KEY);
        localStorage.removeItem("trip_expense_splitter_auth_token_v1");
        localStorage.removeItem("tripsplit_auth_token");
        localStorage.removeItem("token");
        sessionStorage.clear();
      } catch {}
    }
  };

  // Continue as guest
  const continueAsGuest = async () => {
    const localGuest: UserAccount = {
      id: `guest_${Date.now()}`,
      name: "Guest Traveler",
      email: `guest_${Date.now()}@splittrip.local`,
      avatarColor: "#0F6B65",
      bio: "Guest Explorer",
      createdAt: new Date().toISOString(),
    };
    persistUser(localGuest);
  };

  // Update profile
  const updateProfile = async (updatedData: Partial<UserAccount>) => {
    if (!currentUser) return;
    const updated: UserAccount = {
      ...currentUser,
      ...updatedData,
    };
    setCurrentUser(updated);

    try {
      const users = getLocalRegisteredUsers();
      const idx = users.findIndex((u) => u.id === updated.id);
      if (idx >= 0) {
        users[idx] = {
          ...users[idx],
          name: updated.name,
          phone: updated.phone,
          avatarColor: updated.avatarColor,
          avatarUrl: updated.avatarUrl,
          bio: updated.bio,
        };
        localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));
      }
    } catch (e) {}

    try {
      if (updatedData.name || updatedData.avatarColor || updatedData.bio || updatedData.phone) {
        await supabase.auth.updateUser({
          data: {
            name: updated.name,
            phone: updated.phone,
            avatarColor: updated.avatarColor,
            bio: updated.bio,
          },
        });
      }

      const { error } = await supabase.rpc("update_my_profile", {
        p_name: updated.name,
        p_phone: updated.phone || null,
        p_avatar_color: updated.avatarColor,
        p_avatar_url: updated.avatarUrl || null,
        p_bio: updated.bio || null,
      });

      if (error) {
        setProfileToast("Profile couldn't be saved.");
        setTimeout(() => setProfileToast(null), 4000);
      }
    } catch (e) {
      console.warn("Could not sync updated profile to Supabase:", e);
      setProfileToast("Profile couldn't be saved.");
      setTimeout(() => setProfileToast(null), 4000);
    }

    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  // Delete account
  const deleteAccount = (userId: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== userId));
    if (currentUser?.id === userId) {
      logout();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        accounts,
        isAuthenticated: !!currentUser,
        token,
        isPasswordRecovery,
        setIsPasswordRecovery,
        login,
        signup,
        resendConfirmationEmail,
        sendPasswordReset,
        updatePassword,
        logout,
        updateProfile,
        deleteAccount,
        continueAsGuest,
      }}
    >
      {children}
      {profileToast && (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] bg-rose-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg"
        >
          {profileToast}
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
