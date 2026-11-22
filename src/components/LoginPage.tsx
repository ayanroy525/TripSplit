import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { C, PRESET_AVATAR_PALETTE } from "../utils/constants";
import { ThemeToggle } from "./ThemeToggle";
import { ResetPasswordModal } from "./ResetPasswordModal";
import {
  Compass,
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Bell,
  MessageCircle,
  LogIn,
  UserPlus,
  AlertCircle,
  KeyRound,
  Loader2,
  Send,
} from "lucide-react";

interface LoginPageProps {
  onSuccess?: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const { login, signup, continueAsGuest, sendPasswordReset } = useAuth();

  const [activeTab, setActiveTab] = useState<"login" | "signup" | "reset">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // Reset password state
  const [resetEmail, setResetEmail] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);
  const [resetErrorDetails, setResetErrorDetails] = useState<{
    code?: string;
    message?: string;
    raw?: any;
  } | null>(null);

  // Sign up form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarColor, setAvatarColor] = useState(PRESET_AVATAR_PALETTE[0] || "#E39A2D");
  const [bio, setBio] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = await login(loginEmail, loginPassword);
    if (!result.success) {
      setError(result.error || "Failed to log in");
    } else if (onSuccess) {
      onSuccess();
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccessMsg(null);
    setResetErrorDetails(null);

    const targetEmail = (resetEmail || loginEmail).trim();
    if (!targetEmail || !targetEmail.includes("@")) {
      setError("Please enter a valid email address to receive the password reset link.");
      return;
    }

    setIsResetting(true);
    try {
      const res = await sendPasswordReset(targetEmail);
      if (res.success) {
        setResetSuccessMsg(
          `Password reset link sent to ${targetEmail}! Please check your email inbox (and spam folder) and follow the link to securely set a new password.`
        );
      } else {
        setError(res.error || "Unable to send password reset email. Please try again.");
        setResetErrorDetails({
          code: res.errorCode || "unknown-error",
          message: res.error,
          raw: res.rawError,
        });
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred. Please try again.");
      setResetErrorDetails({
        code: err?.code || "exception",
        message: err?.message || String(err),
        raw: err,
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("Please provide your full name");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!agreeTerms) {
      setError("Please accept the terms of service to continue");
      return;
    }

    setIsSigningUp(true);
    const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : undefined;

    try {
      const result = await signup({
        name: fullName.trim(),
        email: email.trim(),
        phone: fullPhone,
        avatarColor,
        bio: bio.trim() || "Travel Enthusiast",
        password,
      });

      if (!result.success) {
        setError(result.error || "Failed to create account");
      } else if (onSuccess) {
        onSuccess();
      }
    } finally {
      setIsSigningUp(false);
    }
  };

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: "None", color: C.line };
    if (pass.length < 6) return { score: 1, text: "Weak", color: C.rust };
    if (pass.length < 9) return { score: 2, text: "Fair", color: C.marigoldDark };
    return { score: 3, text: "Strong", color: C.teal };
  };

  const strength = getPasswordStrength(password);

  return (
    <div
      id="login-page-container"
      style={{
        minHeight: "100vh",
        backgroundColor: C.paper,
        backgroundImage: "var(--c-mesh-bg)",
        color: C.ink,
        fontFamily: "'Manrope', sans-serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Top Navigation Bar */}
      <header
        className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 sticky top-0 z-30"
        style={{
          borderBottom: `1px solid ${C.line}`,
          background: "var(--c-glass-header, rgba(255, 255, 255, 0.82))",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: "linear-gradient(135deg, #0D7A72 0%, #14B8A6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              boxShadow: "0 6px 16px rgba(20, 184, 166, 0.32)",
              flexShrink: 0,
              overflow: "hidden",
              border: "1px solid rgba(45, 212, 191, 0.35)",
            }}
          >
            <img
              src="/assets/brand/tripsplit-logo-icon.jpg"
              alt="TripSplit Logo"
              referrerPolicy="no-referrer"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1
              className="text-base sm:text-[19px]"
              style={{
                fontWeight: 800,
                color: C.ink,
                margin: 0,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              TravelSplit
            </h1>
            <p
              className="hidden sm:block"
              style={{ fontSize: 11, color: C.inkSoft, margin: 0, fontWeight: 600 }}
            >
              Travel together. Split expenses easily.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => {
              continueAsGuest();
              if (onSuccess) onSuccess();
            }}
            className="px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 text-xs transition-all hover:opacity-90"
            style={{
              background: C.paperDark,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              fontWeight: 700,
              color: C.ink,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span className="hidden md:inline">Explore as Guest</span>
            <span className="inline md:hidden">Guest</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </header>

      {/* Main Form Center Area */}
      <main
        className="px-3.5 py-5 sm:px-6 sm:py-9"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="w-full max-w-[1040px] grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-7 items-stretch">
          {/* Left Column on Desktop / Bottom on Mobile: Feature Highlights & Hero Card */}
          <div
            className="order-2 lg:order-1 p-5 sm:p-8"
            style={{
              background: "var(--c-hero-surface, linear-gradient(140deg, #072227 0%, #0C4341 52%, #082B31 100%))",
              border: "1px solid var(--c-hero-border, rgba(45, 212, 191, 0.32))",
              borderRadius: 24,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 22px 48px -12px rgba(6, 28, 33, 0.35)",
              color: "#F8FAFC",
              minWidth: 0,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(251, 191, 36, 0.14)",
                  border: "1px solid rgba(251, 191, 36, 0.45)",
                  borderRadius: 8,
                  padding: "5px 11px",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#FBBF24",
                  marginBottom: 16,
                }}
              >
                <Sparkles size={13} />
                <span>Next-Gen Group Travel Ledger</span>
              </div>

              <h2
                className="text-[24px] sm:text-[31px]"
                style={{
                  fontFamily: "'Fraunces', 'Playfair Display', serif",
                  fontWeight: 800,
                  lineHeight: 1.18,
                  letterSpacing: "-0.02em",
                  color: "#F8FAFC",
                  margin: "0 0 12px 0",
                  textWrap: "balance" as any,
                }}
              >
                Travel together, split fair, settle in seconds.
              </h2>
              <p
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "#CBD5E1",
                  margin: "0 0 22px 0",
                }}
              >
                Manage group vacations, track out-of-pocket bills, simplify multi-currency debts, and record manual settlements with recipient verification.
              </p>

              {/* Feature Grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.11)",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      background: "rgba(45, 212, 191, 0.16)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#2DD4BF",
                      flexShrink: 0,
                    }}
                  >
                    <CheckCircle2 size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#F8FAFC" }}>
                      Manual Settlement & Receiver Confirmation
                    </div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 2, lineHeight: 1.45 }}>
                      Record offline cash or bank payments with two-party recipient confirmation and full audit trails.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.11)",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      background: "rgba(251, 191, 36, 0.16)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FBBF24",
                      flexShrink: 0,
                    }}
                  >
                    <Bell size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#F8FAFC" }}>
                      Instant Real-Time Updates
                    </div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 2, lineHeight: 1.45 }}>
                      Everyone in the group sees new bills, balance adjustments, and payments synchronously.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.11)",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      background: "rgba(74, 222, 128, 0.16)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#4ADE80",
                      flexShrink: 0,
                    }}
                  >
                    <MessageCircle size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#F8FAFC" }}>
                      WhatsApp 1-Click Broadcasts
                    </div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 2, lineHeight: 1.45 }}>
                      Send formatted balance sheets and payment reminders directly to group chats.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column on Desktop / Top on Mobile: Sign In / Create Account Card */}
          <div
            className="order-1 lg:order-2 p-5 sm:p-8"
            style={{
              background: C.card,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1px solid ${C.line}`,
              borderRadius: 24,
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--c-card-shadow)",
              minWidth: 0,
            }}
          >
            {/* Segmented Switcher Tabs */}
            <div
              style={{
                display: "flex",
                background: C.paperDark,
                borderRadius: 14,
                padding: 4,
                marginBottom: 22,
                border: `1px solid ${C.line}`,
              }}
            >
              <button
                id="tab-btn-login"
                type="button"
                onClick={() => {
                  setActiveTab("login");
                  setError(null);
                  setResetSuccessMsg(null);
                }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  background: activeTab === "login" ? C.card : "transparent",
                  color: activeTab === "login" ? C.ink : C.inkSoft,
                  fontWeight: activeTab === "login" ? 800 : 600,
                  fontSize: 13.5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  boxShadow: activeTab === "login" ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <LogIn size={15} color={activeTab === "login" ? C.marigoldDark : C.inkSoft} />
                <span>Log In</span>
              </button>

              <button
                id="tab-btn-signup"
                type="button"
                onClick={() => {
                  setActiveTab("signup");
                  setError(null);
                  setResetSuccessMsg(null);
                }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  background: activeTab === "signup" ? C.card : "transparent",
                  color: activeTab === "signup" ? C.ink : C.inkSoft,
                  fontWeight: activeTab === "signup" ? 800 : 600,
                  fontSize: 13.5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  boxShadow: activeTab === "signup" ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <UserPlus size={15} color={activeTab === "signup" ? C.teal : C.inkSoft} />
                <span>Create Account</span>
              </button>
            </div>

            {/* Error Banner Alert */}
            {error && (
              <div
                style={{
                  background: "rgba(194, 84, 58, 0.12)",
                  border: `1.5px solid ${C.rust}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 16,
                  color: C.rust,
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div>{error}</div>
                  {activeTab === "signup" && error.includes("already exists") ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("login");
                        setError(null);
                        setResetSuccessMsg(null);
                        if (email) setLoginEmail(email);
                      }}
                      style={{
                        marginTop: 6,
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: C.teal,
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: "pointer",
                        textDecoration: "underline",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>Click here to Log In with your password &rarr;</span>
                    </button>
                  ) : activeTab === "login" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {(error.toLowerCase().includes("no account found") ||
                        error.toLowerCase().includes("create account")) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {loginPassword.length >= 6 && (
                            <button
                              id="btn-quick-create-account"
                              type="button"
                              onClick={async () => {
                                setError(null);
                                setIsSigningUp(true);
                                try {
                                  const emailPrefix = loginEmail.includes("@") ? loginEmail.split("@")[0] : loginEmail;
                                  const cleanName = emailPrefix.replace(/[._-]/g, " ").replace(/\d+/g, "").trim() || "Traveler";
                                  const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
                                  const res = await signup({
                                    name: formattedName,
                                    email: loginEmail.trim().toLowerCase(),
                                    phone: !loginEmail.includes("@") ? loginEmail.trim() : undefined,
                                    password: loginPassword,
                                    avatarColor: PRESET_AVATAR_PALETTE[0] || "#E39A2D",
                                    bio: "Travel Enthusiast",
                                  });
                                  if (res.success && onSuccess) {
                                    onSuccess();
                                  } else if (!res.success) {
                                    setError(res.error || "Failed to create account");
                                  }
                                } finally {
                                  setIsSigningUp(false);
                                }
                              }}
                              style={{
                                background: C.marigold,
                                color: "#ffffff",
                                border: "none",
                                borderRadius: 8,
                                padding: "7px 14px",
                                fontWeight: 800,
                                fontSize: 12.5,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                boxShadow: "0 2px 6px rgba(217, 119, 6, 0.3)",
                              }}
                            >
                              <UserPlus size={14} />
                              <span>Create account with this password &amp; Log In &rarr;</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab("signup");
                              setError(null);
                              setResetSuccessMsg(null);
                              if (loginEmail.includes("@")) {
                                setEmail(loginEmail);
                              } else if (loginEmail.replace(/\D/g, "").length >= 7) {
                                setPhone(loginEmail);
                              }
                              if (loginPassword) {
                                setPassword(loginPassword);
                                setConfirmPassword(loginPassword);
                              }
                            }}
                            style={{
                              background: "rgba(227, 154, 45, 0.15)",
                              color: C.marigoldDark,
                              border: `1px solid ${C.marigold}`,
                              borderRadius: 8,
                              padding: "6px 12px",
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span>Fill full profile details &rarr;</span>
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("reset");
                          setError(null);
                          setResetSuccessMsg(null);
                          if (loginEmail.includes("@")) setResetEmail(loginEmail);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: C.marigoldDark,
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: "pointer",
                          textDecoration: "underline",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          width: "fit-content",
                        }}
                      >
                        <span>Forgot your password? Click here to request a password reset link &rarr;</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* LOGIN FORM */}
            {activeTab === "login" && (
              <form onSubmit={handleLoginSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: C.ink,
                      marginBottom: 6,
                    }}
                  >
                    Email or Phone Number
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail
                      size={16}
                      color={C.inkSoft}
                      style={{ position: "absolute", left: 14, top: 13, pointerEvents: "none" }}
                    />
                    <input
                      id="input-login-email"
                      type="text"
                      required
                      value={loginEmail}
                      onChange={(e) => {
                        setLoginEmail(e.target.value);
                      }}
                      placeholder="Enter email address or phone number"
                      style={{
                        width: "100%",
                        padding: "11px 14px 11px 40px",
                        borderRadius: 10,
                        border: `1.5px solid ${C.line}`,
                        background: C.inputBg,
                        color: C.ink,
                        fontSize: 13.5,
                        fontWeight: 600,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: C.ink,
                      marginBottom: 6,
                    }}
                  >
                    Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock
                      size={16}
                      color={C.inkSoft}
                      style={{ position: "absolute", left: 14, top: 13, pointerEvents: "none" }}
                    />
                    <input
                      id="input-login-password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your account password"
                      style={{
                        width: "100%",
                        padding: "11px 40px 11px 40px",
                        borderRadius: 10,
                        border: `1.5px solid ${C.line}`,
                        background: C.inputBg,
                        color: C.ink,
                        fontSize: 13.5,
                        fontWeight: 600,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: 12,
                        top: 11,
                        background: "none",
                        border: "none",
                        color: C.inkSoft,
                        cursor: "pointer",
                        padding: 2,
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12.5,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.inkSoft }}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      style={{ accentColor: C.marigoldDark, width: 15, height: 15 }}
                    />
                    <span>Remember this session</span>
                  </label>

                  <button
                    id="btn-forgot-password-link"
                    type="button"
                    onClick={() => {
                      setActiveTab("reset");
                      setError(null);
                      setResetSuccessMsg(null);
                      if (loginEmail) setResetEmail(loginEmail);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.marigoldDark,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "2px 0",
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>

                <button
                  id="btn-submit-login"
                  type="submit"
                  className="hover:brightness-105 active:scale-[0.99] transition-all"
                  style={{
                    marginTop: 8,
                    background: "linear-gradient(135deg, #E5850B 0%, #C26A05 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 14,
                    padding: "13.5px",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 8px 24px -4px rgba(229, 133, 11, 0.4)",
                  }}
                >
                  <LogIn size={16} />
                  <span>Log In to Account</span>
                </button>
              </form>
            )}

            {/* FORGOT / RESET PASSWORD FORM */}
            {activeTab === "reset" && (
              <form onSubmit={handleResetPasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    background: "rgba(227, 154, 45, 0.08)",
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    padding: 14,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "rgba(227, 154, 45, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: C.marigoldDark,
                      flexShrink: 0,
                    }}
                  >
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: 13.5, fontWeight: 800, color: C.ink }}>
                      Reset Your Password
                    </h4>
                    <p style={{ margin: 0, fontSize: 12, color: C.inkSoft, lineHeight: 1.45 }}>
                      Enter your registered email address and we'll send a secure password reset link to your inbox.
                    </p>
                  </div>
                </div>

                {resetSuccessMsg && (
                  <div
                    style={{
                      background: "rgba(15, 107, 101, 0.1)",
                      border: `1.5px solid ${C.teal}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      color: C.teal,
                      fontSize: 12.5,
                      fontWeight: 700,
                      lineHeight: 1.45,
                    }}
                  >
                    <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{resetSuccessMsg}</span>
                  </div>
                )}

                {resetErrorDetails && (
                  <div
                    style={{
                      background: "rgba(194, 84, 58, 0.08)",
                      border: `1.5px solid ${C.rust}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      color: C.rust,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 12.5 }}>
                      <AlertCircle size={17} style={{ flexShrink: 0 }} />
                      <span>Notice</span>
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 11.5, background: "rgba(0,0,0,0.04)", padding: "6px 8px", borderRadius: 6, wordBreak: "break-all" }}>
                      <strong>Code:</strong> {resetErrorDetails.code || "unknown"}
                      <br />
                      <strong>Message:</strong> {resetErrorDetails.message || "none"}
                    </div>
                  </div>
                )}

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: C.ink,
                      marginBottom: 6,
                    }}
                  >
                    Registered Email Address
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail
                      size={16}
                      color={C.inkSoft}
                      style={{ position: "absolute", left: 14, top: 13, pointerEvents: "none" }}
                    />
                    <input
                      id="input-reset-email"
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="e.g. yourname@gmail.com"
                      style={{
                        width: "100%",
                        padding: "11px 14px 11px 40px",
                        borderRadius: 10,
                        border: `1.5px solid ${C.line}`,
                        background: C.inputBg,
                        color: C.ink,
                        fontSize: 13.5,
                        fontWeight: 600,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                <button
                  id="btn-submit-reset-password"
                  type="submit"
                  disabled={isResetting}
                  style={{
                    marginTop: 4,
                    background: C.marigoldDark,
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 12,
                    padding: "13px",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: isResetting ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 4px 12px rgba(227, 154, 45, 0.3)",
                    opacity: isResetting ? 0.7 : 1,
                  }}
                >
                  {isResetting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  <span>{isResetting ? "Sending Reset Link..." : "Send Password Reset Link"}</span>
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    id="btn-back-to-login"
                    type="button"
                    onClick={() => {
                      setActiveTab("login");
                      setError(null);
                      setResetSuccessMsg(null);
                    }}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: `1.5px solid ${C.line}`,
                      borderRadius: 12,
                      padding: "11px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.ink,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <ArrowLeft size={15} />
                    <span>Back to Log In</span>
                  </button>
                </div>
              </form>
            )}

            {/* SIGN UP FORM */}
            {activeTab === "signup" && (
              <form onSubmit={handleSignupSubmit} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {/* Full Name */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 5 }}>
                    Full Name *
                  </label>
                  <div style={{ position: "relative" }}>
                    <User
                      size={15}
                      color={C.inkSoft}
                      style={{ position: "absolute", left: 12, top: 12, pointerEvents: "none" }}
                    />
                    <input
                      id="input-signup-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter full name"
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 36px",
                        borderRadius: 9,
                        border: `1.5px solid ${C.line}`,
                        background: C.inputBg,
                        color: C.ink,
                        fontSize: 13,
                        fontWeight: 600,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 5 }}>
                    Email Address *
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail
                      size={15}
                      color={C.inkSoft}
                      style={{ position: "absolute", left: 12, top: 12, pointerEvents: "none" }}
                    />
                    <input
                      id="input-signup-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email address"
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 36px",
                        borderRadius: 9,
                        border: `1.5px solid ${C.line}`,
                        background: C.inputBg,
                        color: C.ink,
                        fontSize: 13,
                        fontWeight: 600,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                {/* Mobile / WhatsApp Number & Country code */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 5 }}>
                    WhatsApp / Mobile Number (For instant alerts)
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      style={{
                        padding: "10px 8px",
                        borderRadius: 9,
                        border: `1.5px solid ${C.line}`,
                        background: C.inputBg,
                        color: C.ink,
                        fontSize: 12.5,
                        fontWeight: 800,
                        outline: "none",
                      }}
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+65">🇸🇬 +65</option>
                      <option value="+61">🇦🇺 +61</option>
                      <option value="+49">🇩🇪 +49</option>
                    </select>

                    <div style={{ position: "relative", flex: 1 }}>
                      <Phone
                        size={15}
                        color={C.inkSoft}
                        style={{ position: "absolute", left: 12, top: 12, pointerEvents: "none" }}
                      />
                      <input
                        id="input-signup-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="98765 43210"
                        style={{
                          width: "100%",
                          padding: "10px 12px 10px 36px",
                          borderRadius: 9,
                          border: `1.5px solid ${C.line}`,
                          background: C.inputBg,
                          color: C.ink,
                          fontSize: 13,
                          fontWeight: 600,
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Passwords */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 5 }}>
                      Password *
                    </label>
                    <input
                      id="input-signup-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 chars"
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: 9,
                        border: `1.5px solid ${C.line}`,
                        background: C.inputBg,
                        color: C.ink,
                        fontSize: 12.5,
                        fontWeight: 600,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 5 }}>
                      Confirm Password *
                    </label>
                    <input
                      id="input-signup-confirm-password"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-type password"
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: 9,
                        border: `1.5px solid ${C.line}`,
                        background: C.inputBg,
                        color: C.ink,
                        fontSize: 12.5,
                        fontWeight: 600,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                {/* Password Strength Indicator */}
                {password && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 999,
                        background: C.line,
                        overflow: "hidden",
                        display: "flex",
                      }}
                    >
                      <div
                        style={{
                          width: `${(strength.score / 3) * 100}%`,
                          background: strength.color,
                          transition: "width 0.2s ease",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: strength.color }}>
                      {strength.text}
                    </span>
                  </div>
                )}

                {/* Avatar Color Choice */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 6 }}>
                    Select Profile Avatar Color
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {PRESET_AVATAR_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAvatarColor(c)}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 999,
                          background: c,
                          border: avatarColor === c ? "2.5px solid #ffffff" : "2px solid transparent",
                          outline: avatarColor === c ? `2px solid ${c}` : "none",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Terms Checkbox */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 11.5,
                    color: C.inkSoft,
                    cursor: "pointer",
                    marginTop: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    style={{ accentColor: C.marigoldDark, marginTop: 2 }}
                  />
                  <span>
                    I agree to terms of service and store my trip logs with cloud encryption.
                  </span>
                </label>

                {/* Submit Sign Up CTA */}
                <button
                  id="btn-submit-signup"
                  type="submit"
                  disabled={isSigningUp}
                  className="hover:brightness-105 active:scale-[0.99] transition-all"
                  style={{
                    marginTop: 6,
                    background: "linear-gradient(135deg, #0D7A72 0%, #14B8A6 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 14,
                    padding: "13px",
                    fontSize: 13.5,
                    fontWeight: 800,
                    cursor: isSigningUp ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 8px 24px -4px rgba(20, 184, 166, 0.38)",
                    opacity: isSigningUp ? 0.7 : 1,
                  }}
                >
                  {isSigningUp ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  <span>{isSigningUp ? "Creating Account..." : "Create Account & Start Splitting"}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer
        style={{
          borderTop: `1px solid ${C.line}`,
          padding: "16px 24px",
          textAlign: "center",
          fontSize: 12,
          color: C.inkSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 12,
          background: "var(--c-glass-header, rgba(255, 255, 255, 0.82))",
          backdropFilter: "blur(14px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={15} color={C.teal} />
          <span>Encrypted Sessions & Real-Time Group Sync</span>
        </div>
        <span>•</span>
        <span>TravelSplit — Smart Travel Expense Splitter</span>
      </footer>

      {/* Password Recovery Modal */}
      <ResetPasswordModal />
    </div>
  );
}
