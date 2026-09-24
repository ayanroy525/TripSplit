import React, { createContext, useContext, useState, useEffect } from "react";
import { UserAccount } from "../types";
import { supabase } from "../utils/supabaseClient";

interface AuthContextType {
  currentUser: UserAccount | null;
  accounts: UserAccount[];
  isAuthenticated: boolean;
  token: string | null;
  isPasswordRecovery: boolean;
  setIsPasswordRecovery: (val: boolean) => void;
  login: (
    email: string,
    password?: string
  ) => Promise<{ success: boolean; error?: string; isEmailNotConfirmed?: boolean }>;
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

/**
 * Upserts a user's profile to public.users table.
 * ONLY runs when an active authenticated Supabase session exists to satisfy RLS.
 */
async function syncUserProfileToDatabase(user: any, extraProfile?: Partial<UserAccount>): Promise<void> {
  if (!user || !user.id) return;
  try {
    const meta = user.user_metadata || {};
    const email = user.email || "";
    const name = extraProfile?.name || meta.name || email.split("@")[0] || "Traveler";
    const phone = extraProfile?.phone !== undefined ? extraProfile.phone : (meta.phone || null);
    const avatar_color = extraProfile?.avatarColor || meta.avatarColor || "#0F6B65";
    const avatar_url = extraProfile?.avatarUrl || meta.avatarUrl || null;
    const bio = extraProfile?.bio || meta.bio || "Travel Enthusiast";

    const { error } = await supabase.from("users").upsert({
      id: user.id,
      email,
      name,
      phone,
      avatar_color,
      avatar_url,
      bio,
    });
    if (error) {
      console.warn("Notice syncing user profile to Supabase:", error.message);
    }
  } catch (err) {
    console.warn("Could not sync user profile to database:", err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      return hash.includes("type=recovery") || hash.includes("access_token=");
    }
    return false;
  });

  // Listen to Supabase Auth state changes
  useEffect(() => {
    // 1. Check if arriving via password recovery link
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setIsPasswordRecovery(true);
    }

    // 2. Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setTokenState(session.access_token);
        await syncUserProfileToDatabase(session.user);

        let extraProfile: Partial<UserAccount> | undefined;
        try {
          const { data: profileRow } = await supabase
            .from("users")
            .select("*")
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
        setCurrentUser(userAccount);
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
        setTokenState(session.access_token);
        await syncUserProfileToDatabase(session.user);

        let extraProfile: Partial<UserAccount> | undefined;
        try {
          const { data: profileRow } = await supabase
            .from("users")
            .select("*")
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
        setCurrentUser(userAccount);
        setAccounts((prev) => [userAccount, ...prev.filter((a) => a.id !== userAccount.id)]);
      } else {
        if (!currentUser?.id.startsWith("guest_")) {
          setCurrentUser(null);
          setTokenState(null);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Supabase Email & Password Login
  const login = async (
    emailOrName: string,
    password?: string
  ): Promise<{ success: boolean; error?: string; isEmailNotConfirmed?: boolean }> => {
    const trimmedEmail = emailOrName.trim().toLowerCase();
    if (!trimmedEmail) {
      return { success: false, error: "Please enter your email address." };
    }
    if (!password) {
      return { success: false, error: "Please enter your password." };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        let friendlyError = error.message;
        const isEmailNotConfirmed =
          error.message.toLowerCase().includes("email not confirmed") ||
          (error as any).code === "email_not_confirmed";

        if (error.message.includes("Invalid login credentials")) {
          friendlyError = "Invalid email or password. Please verify and try again.";
        } else if (isEmailNotConfirmed) {
          friendlyError = "Please verify your email address to log in.";
        }
        return { success: false, error: friendlyError, isEmailNotConfirmed };
      }

      if (data.session && data.user) {
        setTokenState(data.session.access_token);
        await syncUserProfileToDatabase(data.user);

        let extraProfile: Partial<UserAccount> | undefined;
        try {
          const { data: profileRow } = await supabase
            .from("users")
            .select("*")
            .eq("id", data.user.id)
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

        const userAccount = buildUserFromSupabase(data.user, extraProfile);
        setCurrentUser(userAccount);
        setAccounts((prev) => [userAccount, ...prev.filter((a) => a.id !== userAccount.id)]);
        return { success: true };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to sign in. Please try again.",
      };
    }
  };

  // Supabase Email & Password Sign up
  const signup = async (
    accountData: Omit<UserAccount, "id" | "createdAt">
  ): Promise<{ success: boolean; error?: string; requiresConfirmation?: boolean }> => {
    const trimmedEmail = accountData.email.trim().toLowerCase();
    const trimmedName = accountData.name.trim();

    if (!trimmedName) {
      return { success: false, error: "Please enter your full name." };
    }
    if (!trimmedEmail) {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (!accountData.password || accountData.password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters long." };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: accountData.password,
        options: {
          data: {
            name: trimmedName,
            phone: accountData.phone || "",
            avatarColor: accountData.avatarColor || "#0F6B65",
            bio: accountData.bio || "Travel Enthusiast",
          },
        },
      });

      if (error) {
        let friendlyError = error.message;
        if (error.message.includes("already registered")) {
          friendlyError = "An account with this email already exists. Please log in.";
        } else if (
          error.message.toLowerCase().includes("rate limit") ||
          (error as any).code === "over_email_send_rate_limit"
        ) {
          friendlyError =
            "Email send rate limit reached. Please wait a little while or contact the project administrator.";
        }
        return { success: false, error: friendlyError };
      }

      // If email confirmation is ON, Supabase returns data.user with data.session = null
      if (data.user && !data.session) {
        // Do NOT call setCurrentUser() or upsert to users table without authenticated session
        return { success: true, requiresConfirmation: true };
      }

      // If session is present (auto-confirmed or email confirmation disabled)
      if (data.user && data.session) {
        setTokenState(data.session.access_token);
        const newAccount: UserAccount = {
          id: data.user.id,
          name: trimmedName,
          email: trimmedEmail,
          phone: accountData.phone,
          avatarColor: accountData.avatarColor || "#0F6B65",
          bio: accountData.bio || "Travel Enthusiast",
          createdAt: new Date().toISOString(),
        };

        // Sync to users table now that we have an authenticated session
        await syncUserProfileToDatabase(data.user, newAccount);
        setCurrentUser(newAccount);
        setAccounts((prev) => [newAccount, ...prev.filter((a) => a.id !== newAccount.id)]);
        return { success: true, requiresConfirmation: false };
      }

      return { success: true, requiresConfirmation: false };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Signup failed. Please try again.",
      };
    }
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

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      setIsPasswordRecovery(false);
      // Clean up URL hash
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to update password." };
    }
  };

  // Logout handler
  const logout = () => {
    supabase.auth.signOut().catch(() => {});
    setCurrentUser(null);
    setTokenState(null);
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
    setCurrentUser(localGuest);
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

      await supabase.from("users").upsert({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        phone: updated.phone || null,
        avatar_color: updated.avatarColor,
        avatar_url: updated.avatarUrl || null,
        bio: updated.bio || null,
      });
    } catch (e) {
      console.warn("Could not sync updated profile to Supabase:", e);
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
