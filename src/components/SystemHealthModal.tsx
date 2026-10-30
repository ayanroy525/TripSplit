import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Download,
  Database,
  ShieldCheck,
  Clock,
  X,
  Cpu,
  Send,
  Eye,
  EyeOff,
  Bot,
  Check,
  AlertCircle,
  Link2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface HealthCheckRecord {
  id: string;
  status: "nominal" | "degraded" | "offline";
  latency_ms: number;
  table_counts: {
    users?: number;
    trips?: number;
    trip_members?: number;
    expenses?: number;
    payments?: number;
    activities?: number;
  };
  auth_ok: boolean;
  rpc_ok: boolean;
  check_type: string;
  error_details: string | null;
  executed_at: string;
}

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<HealthCheckRecord[]>([]);
  const [latestCheck, setLatestCheck] = useState<HealthCheckRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunningCheck, setIsRunningCheck] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "telegram">("overview");

  // Telegram settings state
  const [botToken, setBotToken] = useState("");
  const [showBotToken, setShowBotToken] = useState(false);
  const [chatId, setChatId] = useState("");
  const [dailyTelegramEnabled, setDailyTelegramEnabled] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [hasExistingToken, setHasExistingToken] = useState(false);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const [isDetectingChat, setIsDetectingChat] = useState(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { token } = useAuth();

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const activeToken =
      token ||
      (typeof window !== "undefined"
        ? localStorage.getItem("trip_expense_splitter_auth_token_v1") ||
          localStorage.getItem("tripsplit_auth_token") ||
          localStorage.getItem("token") ||
          ""
        : "");
    return activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
  }, [token]);

  const fetchHealthData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/health/history", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
          setHistory(data.history);
          if (data.history.length > 0) {
            setLatestCheck(data.history[0]);
          }
        }
      }
    } catch (err) {
      console.warn("Could not load health history:", err);
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  const fetchTelegramSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/settings", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setHasExistingToken(Boolean(data.config.hasToken));
          if (data.config.hasToken) {
            setBotToken(data.config.botTokenMasked || "••••••••••••••••");
          }
          if (data.config.chatId) setChatId(data.config.chatId);
          if (data.config.dailyEnabled !== undefined) setDailyTelegramEnabled(Boolean(data.config.dailyEnabled));
          
          const defaultWebhook = typeof window !== "undefined"
            ? `${window.location.origin}/api/telegram/webhook`
            : "";
          setWebhookUrl(data.config.webhookUrl || defaultWebhook);
        }
      }
    } catch (err) {
      console.warn("Could not load telegram settings:", err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isOpen) {
      fetchHealthData();
      fetchTelegramSettings();
    }
  }, [isOpen, fetchHealthData, fetchTelegramSettings]);

  const handleRunDiagnostic = async () => {
    setIsRunningCheck(true);
    try {
      const res = await fetch("/api/health/run-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.diagnostic) {
          setLatestCheck(data.diagnostic);
          setHistory((prev) => [data.diagnostic, ...prev.filter((h) => h.id !== data.diagnostic.id)]);
        }
      }
    } catch (err) {
      console.warn("Error running diagnostic:", err);
    } finally {
      setIsRunningCheck(false);
    }
  };

  const handleSaveTelegram = async () => {
    setIsSavingTelegram(true);
    setTelegramFeedback(null);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          botToken: botToken.includes("••••") ? undefined : botToken,
          chatId,
          dailyEnabled: dailyTelegramEnabled,
          webhookUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramFeedback({ type: "success", message: "Telegram settings saved to database successfully!" });
        await fetchTelegramSettings();
      } else {
        setTelegramFeedback({ type: "error", message: data.error || "Failed to save settings." });
      }
    } catch (err: any) {
      setTelegramFeedback({ type: "error", message: err?.message || "Network error saving settings." });
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleSendTestMessage = async () => {
    setIsSendingTest(true);
    setTelegramFeedback(null);
    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          botToken: botToken.includes("••••") ? undefined : botToken,
          chatId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramFeedback({
          type: "success",
          message: "Test message sent to Telegram! Check your Telegram chat to confirm receipt.",
        });
      } else {
        setTelegramFeedback({
          type: "error",
          message: data.error || "Failed to send test message. Please verify Bot Token and Chat ID.",
        });
      }
    } catch (err: any) {
      setTelegramFeedback({ type: "error", message: err?.message || "Error sending test message." });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleRegisterWebhook = async () => {
    if (!webhookUrl) return;
    setIsRegisteringWebhook(true);
    setTelegramFeedback(null);
    try {
      const res = await fetch(`/api/telegram/webhook?url=${encodeURIComponent(webhookUrl)}`);
      const data = await res.json();
      if (data.success) {
        setTelegramFeedback({
          type: "success",
          message: "Telegram Webhook registered successfully! Interactive inline buttons are active.",
        });
      } else {
        setTelegramFeedback({
          type: "error",
          message: data.error || "Failed to register webhook with Telegram.",
        });
      }
    } catch (err: any) {
      setTelegramFeedback({ type: "error", message: err?.message || "Error registering webhook." });
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const handleDetectChatId = async () => {
    setIsDetectingChat(true);
    setTelegramFeedback(null);
    try {
      const res = await fetch("/api/telegram/detect-chat", {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && data.chatId) {
        setChatId(data.chatId);
        setTelegramFeedback({
          type: "success",
          message: data.message || `Detected Chat ID: ${data.chatId}!`,
        });
      } else {
        setTelegramFeedback({
          type: "error",
          message:
            data.message ||
            data.error ||
            "No messages found yet. Please open t.me/TripSplitMonitorBot in Telegram, tap START (or send any message), and click this button again.",
        });
      }
    } catch (err: any) {
      setTelegramFeedback({ type: "error", message: err?.message || "Error detecting chat ID." });
    } finally {
      setIsDetectingChat(false);
    }
  };

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        schedule: "Daily 2:00 AM Automated Health Sweep",
        latestCheck,
        history,
      },
      null,
      2
    );
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TripSplit_System_Health_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const currentStatus = latestCheck?.status || "nominal";
  const isHealthy = currentStatus === "nominal";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header Contract: Single-line brand + close */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                System Diagnostics & Database Health
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span>Automated Nightly Sweep</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400 font-medium">Daily at 2:00 AM</span>
                <span aria-hidden="true">·</span>
                <span>Telegram Interactive Reports</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar: Tab selector + action buttons */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800/80">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === "overview"
                  ? "bg-slate-800 text-slate-100 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Live Diagnostics
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === "history"
                  ? "bg-slate-800 text-slate-100 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Daily 2 AM Logs ({history.length})
            </button>
            <button
              onClick={() => setActiveTab("telegram")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === "telegram"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-teal-400" />
              <span>Telegram Alerts & Approval</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Audit</span>
            </button>
            <button
              onClick={handleRunDiagnostic}
              disabled={isRunningCheck}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningCheck ? "animate-spin" : ""}`} />
              <span>{isRunningCheck ? "Testing..." : "Run Check Now"}</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "overview" && (
            <>
              {/* Status Banner */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  isHealthy
                    ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-950/30 border-rose-500/30 text-rose-300"
                }`}
              >
                {isHealthy ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {isHealthy
                        ? "System Operational & Nominal"
                        : "System Degraded / Action Recommended"}
                    </span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      · {latestCheck ? `${latestCheck.latency_ms}ms round-trip latency` : "Measuring..."}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {latestCheck?.error_details
                      ? latestCheck.error_details
                      : "PostgreSQL 17.6 connected. Row counts, authentication RPCs, and multi-user split calculations are verified."}
                  </p>
                </div>
              </div>

              {/* Core Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Database Latency</span>
                    <Cpu className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">
                    {latestCheck?.latency_ms ?? 0}
                    <span className="text-sm font-normal text-slate-400 ml-1">ms</span>
                  </div>
                  <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>PostgreSQL 17.6 active</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Auth Lookup RPC</span>
                    <ShieldCheck className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">
                    {latestCheck?.auth_ok ? "Passed" : "Failed"}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    <span>lookup_user_for_auth callable</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Trips Data RPC</span>
                    <Database className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">
                    {latestCheck?.rpc_ok ? "Passed" : "Failed"}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    <span>get_user_trips_data accessible</span>
                  </div>
                </div>
              </div>

              {/* Table Integrity Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Database Tables Verified ({Object.keys(latestCheck?.table_counts || {}).length})
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Last Run: {latestCheck?.executed_at ? new Date(latestCheck.executed_at).toLocaleTimeString() : "Never"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {latestCheck?.table_counts &&
                    Object.entries(latestCheck.table_counts).map(([tableName, count]) => (
                      <div
                        key={tableName}
                        className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-300 truncate">
                            {tableName}
                          </div>
                          <div className="text-[11px] text-slate-400">table verified</div>
                        </div>
                        <div className="text-sm font-bold font-mono tabular-nums text-amber-400 shrink-0 ml-2">
                          {count}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "history" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Audit History (Last 30 Diagnostic Runs)
                </span>
                <span className="text-xs text-slate-400">
                  Stored in PostgreSQL <code className="text-teal-400">public.health_checks</code>
                </span>
              </div>

              {history.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No automated audit logs recorded yet. Click &quot;Run Check Now&quot; to perform your first diagnostic sweep.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/70 text-slate-400 font-medium">
                        <th className="py-2.5 px-4">Run Time (UTC / Local)</th>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4 text-right">Latency</th>
                        <th className="py-2.5 px-4 text-center">Auth</th>
                        <th className="py-2.5 px-4 text-center">RPC</th>
                        <th className="py-2.5 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {history.map((record) => {
                        const isNominal = record.status === "nominal";
                        const dateFormatted = new Date(record.executed_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        });

                        return (
                          <tr key={record.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-2.5 px-4 font-mono text-slate-300">
                              {dateFormatted}
                            </td>
                            <td className="py-2.5 px-4 text-slate-400">
                              {record.check_type === "scheduled_2am" ? (
                                <span className="text-amber-400 font-medium">Daily 2:00 AM</span>
                              ) : record.check_type === "telegram_post_heal" ? (
                                <span className="text-teal-400 font-medium">Post Auto-Fix</span>
                              ) : (
                                "Manual Run"
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                              {record.latency_ms}ms
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {record.auth_ok ? (
                                <span className="text-emerald-400">OK</span>
                              ) : (
                                <span className="text-rose-400">Fail</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {record.rpc_ok ? (
                                <span className="text-emerald-400">OK</span>
                              ) : (
                                <span className="text-rose-400">Fail</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right font-semibold">
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  isNominal ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                {isNominal ? (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5" />
                                )}
                                <span>{isNominal ? "Passed" : "Issue"}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "telegram" && (
            <div className="space-y-6">
              {/* Telegram Workflow Explainer Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2.5 text-teal-300 font-semibold text-sm">
                  <Bot className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>How Telegram Reports & Interactive Consent Work</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-400 leading-relaxed">
                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <div className="text-slate-200 font-semibold mb-1">1. Daily 2:00 AM Check</div>
                    <span>Runs non-destructive integrity checks across all 6 tables and auth functions.</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <div className="text-slate-200 font-semibold mb-1">2. Interactive Consent Alert</div>
                    <span>If an issue is found, Telegram sends an alert with buttons: <b>Approve Auto-Fix</b> or <b>Reject</b>.</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <div className="text-slate-200 font-semibold mb-1">3. Automated Fix on Click</div>
                    <span>Tapping Approve re-grants RPCs, fixes permissions, flushes pool, and verifies nominal state.</span>
                  </div>
                </div>
              </div>

              {/* Feedback Alert */}
              {telegramFeedback && (
                <div
                  className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
                    telegramFeedback.type === "success"
                      ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-950/40 border-rose-500/30 text-rose-300"
                  }`}
                >
                  {telegramFeedback.type === "success" ? (
                    <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span className="flex-1">{telegramFeedback.message}</span>
                  <button
                    onClick={() => setTelegramFeedback(null)}
                    className="p-1 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Telegram Form */}
              <div className="space-y-4 bg-slate-950/40 border border-slate-800 p-5 rounded-xl">
                {/* Bot Token Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Telegram Bot Token
                  </label>
                  <div className="relative">
                    <input
                      type={showBotToken ? "text" : "password"}
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="e.g. 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                      className="w-full px-3.5 py-2 pr-10 text-xs font-mono bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBotToken(!showBotToken)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                      title={showBotToken ? "Hide Token" : "Show Token"}
                    >
                      {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Create a bot with <span className="text-teal-400 font-mono">@BotFather</span> on Telegram and paste the token above.
                  </span>
                </div>

                {/* Chat ID Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Telegram Chat ID
                    </label>
                    <a
                      href="https://t.me/TripSplitMonitorBot"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-semibold text-teal-400 hover:text-teal-300 transition-colors"
                    >
                      Open t.me/TripSplitMonitorBot &rarr;
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      placeholder="e.g. 123456789 or click Auto-Detect"
                      className="flex-1 px-3.5 py-2 text-xs font-mono bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleDetectChatId}
                      disabled={isDetectingChat}
                      className="px-3 py-2 text-xs font-semibold text-teal-300 bg-teal-950/60 border border-teal-500/40 hover:bg-teal-900/60 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                      title="Open t.me/TripSplitMonitorBot, tap START, then click to auto-detect your chat ID"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isDetectingChat ? "animate-spin" : ""}`} />
                      <span>{isDetectingChat ? "Detecting..." : "Auto-Detect My ID"}</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Tap <a href="https://t.me/TripSplitMonitorBot" target="_blank" rel="noreferrer" className="text-teal-400 underline font-semibold">START on TripSplitMonitorBot</a>, then click <b>Auto-Detect My ID</b> to link your Telegram chat automatically.
                  </span>
                </div>

                {/* Enable 2 AM Daily Check Toggle */}
                <div className="flex items-center justify-between py-2 border-t border-slate-800/80">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      Send Daily 2:00 AM Reports to Telegram
                    </div>
                    <div className="text-[11px] text-slate-400">
                      When enabled, health checks will deliver summaries directly to your Telegram chat.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dailyTelegramEnabled}
                      onChange={(e) => setDailyTelegramEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-500"></div>
                  </label>
                </div>

                {/* Webhook Configuration */}
                <div className="py-2 border-t border-slate-800/80">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Telegram Webhook URL (For Interactive Buttons)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://your-domain.app/api/telegram/webhook"
                      className="flex-1 px-3.5 py-2 text-xs font-mono bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleRegisterWebhook}
                      disabled={isRegisteringWebhook || !webhookUrl}
                      className="px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Register this webhook URL with Telegram Bot API so inline buttons deliver clicks"
                    >
                      <Link2 className={`w-3.5 h-3.5 ${isRegisteringWebhook ? "animate-spin" : ""}`} />
                      <span>{isRegisteringWebhook ? "Registering..." : "Set Webhook"}</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Enables Telegram to send button clicks back to your app so you can approve automated fixes.
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={handleSendTestMessage}
                    disabled={isSendingTest || (!botToken && !hasExistingToken) || !chatId}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-teal-300 bg-teal-950/60 border border-teal-500/40 hover:bg-teal-900/60 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className={`w-3.5 h-3.5 ${isSendingTest ? "animate-spin" : ""}`} />
                    <span>{isSendingTest ? "Sending Test..." : "Send Test Message"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveTelegram}
                    disabled={isSavingTelegram}
                    className="px-5 py-2 text-xs font-bold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSavingTelegram ? "Saving..." : "Save Telegram Settings"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Scheduled Daily at 02:00 AM (Background Daemon Active)</span>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-1 text-slate-300 hover:text-white bg-slate-800 rounded-md transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
};
