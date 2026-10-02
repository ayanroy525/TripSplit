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

const CLIENT_PASSWORD_SALT =
  (import.meta as any).env?.VITE_PASSWORD_SALT ||
  (import.meta as any).env?.PASSWORD_SALT ||
  "";

async function hashPassword(password: string): Promise<string> {
  try {
    const salt = CLIENT_PASSWORD_SALT || "_tripsplit_salt_v1";
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      hash = ((hash << 5) - hash + password.charCodeAt(i)) | 0;
    }
    return `fb_${Math.abs(hash)}`;
  }
}

async function verifyPasswordMatch(
  inputPassword: string,
  storedHashOrPassword?: string | null
): Promise<boolean> {
  // If account was created in a version without password set
  if (!storedHashOrPassword || storedHashOrPassword.trim() === "") {
    return true;
  }
  // Plain text match
  if (storedHashOrPassword === inputPassword || storedHashOrPassword.trim() === inputPassword.trim()) {
    return true;
  }

  // 1. Current salted SHA-256
  const saltedHash = await hashPassword(inputPassword);
  if (storedHashOrPassword === saltedHash) {
    return true;
  }

  // 2. Legacy salted SHA-256 for backward compatibility with previously created accounts
  try {
    const encoder = new TextEncoder();
    const legacyData = encoder.encode(inputPassword + "_tripsplit_salt_v1");
    const hashBuffer = await crypto.subtle.digest("SHA-256", legacyData);
    const legacyHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (storedHashOrPassword === legacyHex) {
      return true;
    }
  } catch (e) {}

  // 3. Unsalted SHA-256
  try {
    const encoder = new TextEncoder();
    const unsaltedBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(inputPassword));
    const unsaltedHex = Array.from(new Uint8Array(unsaltedBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (storedHashOrPassword === unsaltedHex) {
      return true;
    }
  } catch (e) {}

  // 4. Fallback string hash (fb_...)
  let simpleHash = 0;
  for (let i = 0; i < inputPassword.length; i++) {
    simpleHash = ((simpleHash << 5) - simpleHash + inputPassword.charCodeAt(i)) | 0;
  }
  if (storedHashOrPassword === `fb_${Math.abs(simpleHash)}`) {
    return true;
  }

  return false;
}

const LOCAL_CREDENTIALS_KEY = "trip_splitter_user_credentials_v1";
const ACTIVE_USER_KEY = "trip_expense_splitter_active_user_v1";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // One-time security purge of any legacy credentials / passwords in localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(LOCAL_CREDENTIALS_KEY);
      } catch {}
    }
  }, []);
  const [token, setTokenState] = useState<string | null>(null);
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

  // Login supporting Email and Phone with server backend, Supabase Auth, database records, and legacy local accounts
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

    const trimmedInput = rawInput.toLowerCase();
    const cleanDigits = rawInput.replace(/\D/g, "");
    const hashedPassword = await hashPassword(password);

    // 1. Primary Auth: Server-side PostgreSQL login endpoint (bypasses client-side RLS)
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

          // Try Supabase auth in background if available
          if (trimmedInput.includes("@")) {
            supabase.auth.signInWithPassword({ email: trimmedInput, password }).catch(() => {});
          }

          return { success: true, user: userAccount };
        } else if (response.status === 401) {
          // Password mismatch detected by server
          return {
            success: false,
            error: resData.error || "Incorrect password for this account. Please verify your password or use 'Forgot Password?' to reset it.",
          };
        }
      }
    } catch (apiErr) {
      console.warn("Backend auth endpoint notice, attempting client-side fallbacks:", apiErr);
    }

    // 2. Secondary Auth: Attempt Supabase Auth signInWithPassword if input is an email
    if (trimmedInput.includes("@")) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedInput,
          password,
        });

        if (!authError && authData.session && authData.user) {
          setTokenState(authData.session.access_token);
          await syncUserProfileToDatabase(authData.user);

          let extraProfile: Partial<UserAccount> | undefined;
          try {
            const { data: profileRow } = await supabase
              .from("users")
              .select("*")
              .eq("id", authData.user.id)
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

          const userAccount = buildUserFromSupabase(authData.user, extraProfile);
          persistUser(userAccount);
          setAccounts((prev) => [userAccount, ...prev.filter((a) => a.id !== userAccount.id)]);

          return { success: true, user: userAccount };
        } else if (authError) {
          const msg = authError.message?.toLowerCase() || "";
          if (msg.includes("email not confirmed") || msg.includes("confirm your email")) {
            return {
              success: false,
              isEmailNotConfirmed: true,
              error: "Please check your email and click the confirmation link before logging in.",
            };
          }
        }
      } catch (err) {
        console.warn("Supabase auth login notice:", err);
      }
    }

    // 2. Query users from Supabase database table (public.users)
    let foundDbUser: any = null;
    try {
      const { data: usersList, error: queryErr } = await supabase
        .from("users")
        .select("*");

      if (!queryErr && Array.isArray(usersList)) {
        foundDbUser = usersList.find((u) => {
          if (!u) return false;
          if (u.email && u.email.trim().toLowerCase() === trimmedInput) return true;
          if (cleanDigits.length >= 7 && u.phone) {
            const userPhoneDigits = u.phone.replace(/\D/g, "");
            if (
              userPhoneDigits.endsWith(cleanDigits) ||
              cleanDigits.endsWith(userPhoneDigits)
            ) {
              return true;
            }
          }
          if (u.name && u.name.trim().toLowerCase() === trimmedInput) return true;
          return false;
        });
      }
    } catch (e) {
      console.warn("Notice querying users table:", e);
    }

    // If account was found in database
    if (foundDbUser) {
      const isPassValid = await verifyPasswordMatch(password, foundDbUser.password_hash);
      if (isPassValid) {
        // Upgrade password_hash in DB if not currently hashed
        if (foundDbUser.password_hash !== hashedPassword) {
          try {
            await supabase
              .from("users")
              .update({ password_hash: hashedPassword, updated_at: new Date().toISOString() })
              .eq("id", foundDbUser.id);
          } catch (e) {}
        }

        const targetEmail = (foundDbUser.email || trimmedInput).trim().toLowerCase();
        const userAccount: UserAccount = {
          id: foundDbUser.id,
          name: foundDbUser.name || targetEmail.split("@")[0] || "Traveler",
          email: foundDbUser.email || (trimmedInput.includes("@") ? trimmedInput : ""),
          phone: foundDbUser.phone || undefined,
          avatarColor: foundDbUser.avatar_color || "#E39A2D",
          avatarUrl: foundDbUser.avatar_url || undefined,
          bio: foundDbUser.bio || "Travel Enthusiast",
          createdAt: foundDbUser.created_at || new Date().toISOString(),
        };

        persistUser(userAccount);
        setAccounts((prev) => [userAccount, ...prev.filter((a) => a.id !== userAccount.id)]);

        return { success: true, user: userAccount };
      } else {
        return {
          success: false,
          error: "Incorrect password for this account. Please verify your password or use 'Forgot Password?' to reset it.",
        };
      }
    }

    // 3. Check database members table for existing trip participants
    try {
      const { data: membersList } = await supabase.from("members").select("*");
      if (Array.isArray(membersList)) {
        const foundMember = membersList.find((m) => {
          if (!m) return false;
          if (m.email && m.email.trim().toLowerCase() === trimmedInput) return true;
          if (cleanDigits.length >= 7 && m.phone) {
            const memPhone = m.phone.replace(/\D/g, "");
            return memPhone.endsWith(cleanDigits) || cleanDigits.endsWith(memPhone);
          }
          return false;
        });

        if (foundMember) {
          const userAccount: UserAccount = {
            id: foundMember.user_id || foundMember.id || `u_${Date.now()}`,
            name: foundMember.name || "Traveler",
            email: foundMember.email || (trimmedInput.includes("@") ? trimmedInput : ""),
            phone: foundMember.phone || (cleanDigits.length >= 7 ? rawInput : undefined),
            avatarColor: foundMember.avatar_color || "#E39A2D",
            bio: "Travel Enthusiast",
            createdAt: foundMember.joined_at || new Date().toISOString(),
          };

          // Also register in users table
          try {
            await supabase.from("users").upsert({
              id: userAccount.id,
              email: userAccount.email,
              name: userAccount.name,
              phone: userAccount.phone || null,
              avatar_color: userAccount.avatarColor,
              password_hash: hashedPassword,
              updated_at: new Date().toISOString(),
            });
          } catch (e) {}

          persistUser(userAccount);
          setAccounts((prev) => [userAccount, ...prev.filter((a) => a.id !== userAccount.id)]);
          return { success: true, user: userAccount };
        }
      }
    } catch (e) {
      console.warn("Notice querying members table:", e);
    }

    // 4. Fallback check active user / user storage from previous app versions
    try {
      if (typeof window !== "undefined") {
        const previousStoredKeys = [
          ACTIVE_USER_KEY,
          "trip_expense_splitter_auth_user_v3",
          "trip_expense_splitter_v3",
          "trip_expense_splitter_v2",
          "trip_expense_splitter_v1",
        ];

        for (const storageKey of previousStoredKeys) {
          const rawItem = localStorage.getItem(storageKey);
          if (rawItem) {
            try {
              const parsed = JSON.parse(rawItem);
              const targetUser = parsed.authUser || (parsed.id && parsed.name ? parsed : null);
              if (targetUser) {
                const userEmail = (targetUser.email || "").toLowerCase();
                const userPhone = (targetUser.phone || "").replace(/\D/g, "");
                const isMatch =
                  userEmail === trimmedInput ||
                  (cleanDigits.length >= 7 &&
                    (userPhone.endsWith(cleanDigits) || cleanDigits.endsWith(userPhone)));

                if (isMatch) {
                  persistUser(targetUser);
                  setAccounts((prev) => [
                    targetUser,
                    ...prev.filter((a) => a.id !== targetUser.id),
                  ]);
                  return { success: true, user: targetUser };
                }
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.warn("Local credentials lookup notice:", e);
    }

    return {
      success: false,
      error: "No account found matching this email or phone number. Please check your credentials or click 'Create Account' to sign up.",
    };
  };

  // Instant Account Creation - Check for Duplicate Email & Phone (Duplication Not Permitted)
  const signup = async (
    accountData: Omit<UserAccount, "id" | "createdAt">
  ): Promise<{ success: boolean; error?: string; requiresConfirmation?: boolean }> => {
    const trimmedEmail = accountData.email.trim().toLowerCase();
    const trimmedName = accountData.name.trim();
    const cleanPhoneDigits = accountData.phone ? accountData.phone.replace(/\D/g, "") : "";

    if (!trimmedName) {
      return { success: false, error: "Please enter your full name." };
    }
    if (!trimmedEmail) {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (!accountData.password || accountData.password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters long." };
    }

    // 1. DUPLICATION CHECK: Prevent creating an account if email or phone already exists
    try {
      const { data: usersList, error: queryErr } = await supabase
        .from("users")
        .select("*");

      if (!queryErr && Array.isArray(usersList)) {
        // A. Check for existing account with the same email
        const existingEmailUser = usersList.find(
          (u) => u && isEmailMatch(u.email, trimmedEmail)
        );
        if (existingEmailUser) {
          return {
            success: false,
            error: "An account with this email already exists. Please log in with your password.",
          };
        }

        // B. Check for existing account with the same phone number
        if (cleanPhoneDigits.length >= 7) {
          const existingPhoneUser = usersList.find((u) => {
            if (!u || !u.phone) return false;
            return isPhoneMatch(u.phone, accountData.phone);
          });
          if (existingPhoneUser) {
            return {
              success: false,
              error: "An account with this phone number already exists. Please log in with your password.",
            };
          }
        }
      }
    } catch (e) {
      console.warn("Notice checking existing users during signup:", e);
    }

    const hashedPassword = await hashPassword(accountData.password);
    let supabaseUserId: string | null = null;
    let supabaseSessionToken: string | null = null;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: accountData.password,
        options: {
          data: {
            name: trimmedName,
            phone: accountData.phone || "",
            avatarColor: accountData.avatarColor || "#E39A2D",
            bio: accountData.bio || "Travel Enthusiast",
          },
        },
      });

      if (error) {
        if (
          error.message?.toLowerCase().includes("already registered") ||
          error.message?.toLowerCase().includes("user already exists")
        ) {
          return {
            success: false,
            error: "An account with this email already exists. Please log in with your password.",
          };
        }
      }

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
      supabaseUserId ||
      `u_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;

    const newAccount: UserAccount = {
      id: userId,
      name: trimmedName,
      email: trimmedEmail,
      phone: accountData.phone,
      avatarColor: accountData.avatarColor || "#E39A2D",
      bio: accountData.bio || "Travel Enthusiast",
      createdAt: new Date().toISOString(),
    };

    // Save to PostgreSQL via server endpoint and Supabase
    try {
      const serverRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          phone: accountData.phone,
          password: accountData.password,
          avatarColor: accountData.avatarColor,
          bio: accountData.bio,
        }),
      });
      if (serverRes.ok) {
        const sData = await serverRes.json();
        if (sData.token) {
          setTokenState(sData.token);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("trip_expense_splitter_auth_token_v1", sData.token);
            } catch {}
          }
        }
      }
    } catch (e) {}

    // Save directly to Supabase public.users table with password_hash!
    try {
      await supabase.from("users").insert({
        id: userId,
        email: trimmedEmail,
        name: trimmedName,
        phone: accountData.phone || null,
        avatar_color: accountData.avatarColor || "#E39A2D",
        bio: accountData.bio || "Travel Enthusiast",
        password_hash: hashedPassword,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Notice inserting user to users table:", e);
    }

    if (supabaseSessionToken) {
      setTokenState(supabaseSessionToken);
    }

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
    persistUser(null);
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
