import React, { useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  Share2,
  Download,
  FileJson,
  Loader2,
  Printer,
} from "lucide-react";
import { Expense, Member, Payment, SimplifiedDebt, Trip } from "../types";
import { C } from "../utils/constants";
import { money, formatDate } from "../utils/calculations";
import { exportTripToExcel, exportTripToPDF } from "../utils/exportUtils";
import { ModalShell, Pill } from "./Atoms";

interface ShareExportModalProps {
  trip: Trip;
  simplifiedDebts: SimplifiedDebt[];
  paidShare: Record<string, { paid: number; share: number }>;
  netBalances: Record<string, number>;
  onClose: () => void;
}

export function ShareExportModal({
  trip,
  simplifiedDebts,
  paidShare,
  netBalances,
  onClose,
}: ShareExportModalProps) {
  const [copiedText, setCopiedText] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [excelSuccess, setExcelSuccess] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);

  const activeExpenses = (trip.expenses || []).filter((e) => !e.deleted);
  const totalAmount = activeExpenses.reduce((s, e) => s + e.amount, 0);
  const memberMap = new Map(trip.members.map((m) => [m.id, m]));

  // Generate plain text report
  const generateTextSummary = () => {
    let text = `✈️ *${trip.title.toUpperCase()} — EXPENSE SUMMARY*\n`;
    text += `📅 ${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}\n`;
    text += `📍 ${trip.location}\n`;
    text += `💰 Total Trip Spend: ${money(totalAmount)}\n\n`;

    text += `📊 *MEMBER BREAKDOWN:*\n`;
    trip.members.forEach((m) => {
      const data = paidShare[m.id] || { paid: 0, share: 0 };
      const net = netBalances[m.id] || 0;
      const netStr =
        net > 0.01
          ? `Gets back ${money(net)}`
          : net < -0.01
          ? `Owes ${money(-net)}`
          : `Settled`;
      text += `• ${m.name}: Paid ${money(data.paid)} | Share ${money(data.share)} → *${netStr}*\n`;
    });

    text += `\n🤝 *FINAL SETTLEMENTS:* \n`;
    if (simplifiedDebts.length === 0) {
      text += `All settled up! ✨\n`;
    } else {
      simplifiedDebts.forEach((d) => {
        const from = memberMap.get(d.from)?.name || d.from;
        const to = memberMap.get(d.to)?.name || d.to;
        text += `• ${from} ➔ ${to}: *${money(d.amount)}*\n`;
      });
    }

    text += `\n_Generated via Trip Expense Splitter_`;
    return text;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateTextSummary());
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  const handleDownloadExcel = () => {
    try {
      setIsExportingExcel(true);
      exportTripToExcel(trip, trip.members, paidShare, netBalances, simplifiedDebts);
      setExcelSuccess(true);
      setTimeout(() => setExcelSuccess(false), 3000);
    } catch (err) {
      console.error("Excel export error:", err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleDownloadPDF = () => {
    try {
      setIsExportingPDF(true);
      exportTripToPDF(trip, trip.members, paidShare, netBalances, simplifiedDebts);
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 3000);
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleDownloadJSON = () => {
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(trip, null, 2));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute(
      "download",
      `${trip.title.toLowerCase().replace(/\s+/g, "_")}_backup.json`
    );
    dlAnchorElem.click();
  };

  return (
    <ModalShell
      title="Share & Export Report"
      subtitle="Export trip records, download PDF/Excel reports, or copy summaries"
      onClose={onClose}
      width={580}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Quick Action Buttons Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* 1. Copy for Chat */}
          <button
            id="btn-copy-summary"
            type="button"
            onClick={copyToClipboard}
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              border: `1.5px solid ${C.line}`,
              background: C.card,
              color: C.ink,
              fontWeight: 800,
              fontSize: 13.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              textAlign: "left",
              transition: "transform 0.15s ease",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "#25D36618",
                color: "#128C7E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {copiedText ? <Check size={18} /> : <Share2 size={18} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800 }}>{copiedText ? "Copied!" : "Copy for Chat"}</div>
              <span style={{ fontSize: 11, fontWeight: 500, color: C.inkSoft, display: "block" }}>
                WhatsApp / Telegram formatted
              </span>
            </div>
          </button>

          {/* 2. Download Excel (.xlsx) */}
          <button
            id="btn-export-excel"
            type="button"
            onClick={handleDownloadExcel}
            disabled={isExportingExcel}
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              border: `1.5px solid ${C.line}`,
              background: C.card,
              color: C.ink,
              fontWeight: 800,
              fontSize: 13.5,
              cursor: isExportingExcel ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              textAlign: "left",
              transition: "transform 0.15s ease",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "#10B98118",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isExportingExcel ? (
                <Loader2 size={18} className="animate-spin" />
              ) : excelSuccess ? (
                <Check size={18} color="#059669" />
              ) : (
                <FileSpreadsheet size={18} />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800 }}>{excelSuccess ? "Downloaded!" : "Download Excel"}</div>
              <span style={{ fontSize: 11, fontWeight: 500, color: C.inkSoft, display: "block" }}>
                Multi-sheet .xlsx workbook
              </span>
            </div>
          </button>

          {/* 3. Download PDF */}
          <button
            id="btn-export-pdf"
            type="button"
            onClick={handleDownloadPDF}
            disabled={isExportingPDF}
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              border: `1.5px solid ${C.line}`,
              background: C.card,
              color: C.ink,
              fontWeight: 800,
              fontSize: 13.5,
              cursor: isExportingPDF ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              textAlign: "left",
              transition: "transform 0.15s ease",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "#EF444418",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isExportingPDF ? (
                <Loader2 size={18} className="animate-spin" />
              ) : pdfSuccess ? (
                <Check size={18} color="#DC2626" />
              ) : (
                <FileText size={18} />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800 }}>{pdfSuccess ? "Downloaded!" : "Download PDF"}</div>
              <span style={{ fontSize: 11, fontWeight: 500, color: C.inkSoft, display: "block" }}>
                Itemized report & summary
              </span>
            </div>
          </button>

          {/* 4. JSON Backup */}
          <button
            id="btn-export-json"
            type="button"
            onClick={handleDownloadJSON}
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              border: `1.5px solid ${C.line}`,
              background: C.card,
              color: C.ink,
              fontWeight: 800,
              fontSize: 13.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              textAlign: "left",
              transition: "transform 0.15s ease",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "#EDE9FE",
                color: "#7B5EA7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FileJson size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800 }}>JSON Backup</div>
              <span style={{ fontSize: 11, fontWeight: 500, color: C.inkSoft, display: "block" }}>
                Full trip data snapshot
              </span>
            </div>
          </button>
        </div>

        {/* Text Preview Box */}
        <div style={{ marginTop: 6 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                textTransform: "uppercase",
                color: C.inkSoft,
              }}
            >
              Text Preview
            </span>
            <span style={{ fontSize: 11, color: C.teal, fontWeight: 700 }}>
              {activeExpenses.length} expenses • {money(totalAmount)} total
            </span>
          </div>
          <pre
            style={{
              background: C.paperDark,
              border: `1.5px solid ${C.line}`,
              borderRadius: 12,
              padding: 14,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              color: C.ink,
              whiteSpace: "pre-wrap",
              maxHeight: 180,
              overflowY: "auto",
            }}
          >
            {generateTextSummary()}
          </pre>
        </div>
      </div>
    </ModalShell>
  );
}

