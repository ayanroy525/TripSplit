import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Trip, Member, Expense, Payment, SimplifiedDebt } from "../types";
import { formatDate } from "./calculations";

/** Format numbers cleanly for PDF export without Unicode encoding artifacts */
function pdfMoney(n: number | undefined | null, prefix = "Rs. "): string {
  const val = Math.round((n || 0) * 100) / 100;
  return `${prefix}${val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Generates and downloads a rich, multi-sheet Excel (.xlsx) workbook for the trip.
 */
export function exportTripToExcel(
  trip: Trip,
  members: Member[],
  paidShare: Record<string, { paid: number; share: number }>,
  netBalances: Record<string, number>,
  simplifiedDebts: SimplifiedDebt[]
) {
  const memberMap = new Map(members.map((m) => [m.id, m.name]));
  const activeExpenses = (trip.expenses || []).filter((e) => !e.deleted);
  const totalSpend = activeExpenses.reduce((s, e) => s + e.amount, 0);

  const wb = XLSX.utils.book_new();

  // --- SHEET 1: Trip Overview & Balances ---
  const overviewData = [
    ["TRIP EXPENSE REPORT", trip.title],
    ["Location", trip.location || "N/A"],
    ["Dates", `${trip.startDate} to ${trip.endDate}`],
    ["Currency", trip.currency || "INR"],
    ["Total Spend", totalSpend],
    ["Active Expenses Count", activeExpenses.length],
    [],
    ["MEMBER BALANCES & SHARES"],
    ["Member Name", "Role", "Phone", "Total Paid (₹)", "Total Share (₹)", "Net Balance (₹)", "Status"],
    ...members.map((m) => {
      const data = paidShare[m.id] || { paid: 0, share: 0 };
      const net = netBalances[m.id] || 0;
      const status =
        net > 0.01 ? `Gets Back ₹${net.toFixed(2)}` : net < -0.01 ? `Owes ₹${(-net).toFixed(2)}` : "Settled";
      return [
        m.name,
        m.role,
        m.phone || "N/A",
        data.paid,
        data.share,
        net,
        status,
      ];
    }),
  ];

  const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
  wsOverview["!cols"] = [
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsOverview, "Trip Overview & Balances");

  // --- SHEET 2: Expenses Ledger ---
  const expensesHeader = [
    "Expense ID",
    "Title",
    "Category",
    "Amount (₹)",
    "Date",
    "Paid By",
    "Split Method",
    "Split Breakdown Details",
    "Notes",
  ];

  const expensesData = activeExpenses.map((e) => {
    const paidByName = memberMap.get(e.paidBy) || e.paidBy;
    const splitBreakdown = Object.entries(e.splits || {})
      .map(([id, amt]) => `${memberMap.get(id) || id}: ₹${amt}`)
      .join("; ");

    return [
      e.id,
      e.title,
      e.category,
      e.amount,
      e.date,
      paidByName,
      e.method,
      splitBreakdown,
      e.notes || "",
    ];
  });

  const wsExpenses = XLSX.utils.aoa_to_sheet([expensesHeader, ...expensesData]);
  wsExpenses["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 15 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 40 },
    { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(wb, wsExpenses, "Expenses Ledger");

  // --- SHEET 3: Simplified Settlements ---
  const settlementsHeader = ["Payer (Owes)", "Receiver (Gets Back)", "Amount (₹)", "Status"];
  const settlementsData =
    simplifiedDebts.length === 0
      ? [["All balances are settled!", "", 0, "Settled"]]
      : simplifiedDebts.map((d) => {
          const fromMember = members.find((m) => m.id === d.from);
          const toMember = members.find((m) => m.id === d.to);
          return [
            fromMember?.name || d.from,
            toMember?.name || d.to,
            d.amount,
            "Pending Settlement",
          ];
        });

  const wsSettlements = XLSX.utils.aoa_to_sheet([settlementsHeader, ...settlementsData]);
  wsSettlements["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSettlements, "Settlements Matrix");

  // Generate binary and trigger browser download
  const cleanTitle = (trip.title || "trip").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${cleanTitle}_Expense_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Generates and downloads a clean, beautifully formatted PDF audit report.
 */
export function exportTripToPDF(
  trip: Trip,
  members: Member[],
  paidShare: Record<string, { paid: number; share: number }>,
  netBalances: Record<string, number>,
  simplifiedDebts: SimplifiedDebt[]
) {
  const memberMap = new Map(members.map((m) => [m.id, m.name]));
  const activeExpenses = (trip.expenses || []).filter((e) => !e.deleted);
  const totalSpend = activeExpenses.reduce((s, e) => s + e.amount, 0);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const primaryColor = [15, 107, 101]; // Teal #0F6B65
  const darkTextColor = [27, 38, 59];

  // Header Banner
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(trip.title.toUpperCase(), 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Location: ${trip.location || "N/A"}   |   Dates: ${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`,
    14,
    23
  );
  doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}`, 14, 28);

  // Financial Highlights Box
  let currentY = 36;

  doc.setFillColor(245, 247, 250);
  doc.roundedRect(14, currentY, 182, 22, 3, 3, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, 182, 22, 3, 3, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 107, 101);
  doc.text(`Total Trip Spending: ${pdfMoney(totalSpend)}`, 20, currentY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text(`Total Active Expenses: ${activeExpenses.length} records   |   Trip Members: ${members.length}`, 20, currentY + 16);

  currentY += 30;

  // SECTION 1: Member Balances Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 107, 101);
  doc.text("1. Member Balance & Share Summary", 14, currentY);

  const memberRows = members.map((m) => {
    const data = paidShare[m.id] || { paid: 0, share: 0 };
    const net = netBalances[m.id] || 0;
    const netFormatted =
      net > 0.01 ? `+${pdfMoney(net)} (Gets Back)` : net < -0.01 ? `-${pdfMoney(-net)} (Owes)` : "Rs. 0.00 (Settled)";
    return [
      m.name,
      m.role.toUpperCase(),
      pdfMoney(data.paid),
      pdfMoney(data.share),
      netFormatted,
    ];
  });

  autoTable(doc, {
    startY: currentY + 4,
    head: [["Member", "Role", "Total Paid", "Fair Share", "Net Settlement"]],
    body: memberRows,
    theme: "grid",
    headStyles: {
      fillColor: [15, 107, 101],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [27, 38, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // SECTION 2: Final Simplified Settlements Table
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 107, 101);
  doc.text("2. Final Simplified Settlements (Minimal Cashflow)", 14, currentY);

  const settlementRows =
    simplifiedDebts.length === 0
      ? [["All balances are settled! No payments required.", "-", "-", "Settled"]]
      : simplifiedDebts.map((d) => {
          const fromName = memberMap.get(d.from) || d.from;
          const toMember = members.find((m) => m.id === d.to);
          return [
            fromName,
            toMember?.name || d.to,
            pdfMoney(d.amount),
            "Cash / Bank Transfer",
          ];
        });

  autoTable(doc, {
    startY: currentY + 4,
    head: [["From (Debtor)", "To (Creditor)", "Amount", "Settlement Mode"]],
    body: settlementRows,
    theme: "grid",
    headStyles: {
      fillColor: [227, 154, 45],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [254, 251, 244],
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // SECTION 3: All Expenses Table
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 107, 101);
  doc.text("3. Itemized Expenses Ledger", 14, currentY);

  const expenseRows = activeExpenses.map((e) => {
    const paidByName = memberMap.get(e.paidBy) || e.paidBy;
    return [
      formatDate(e.date),
      e.title,
      e.category,
      paidByName,
      pdfMoney(e.amount),
    ];
  });

  autoTable(doc, {
    startY: currentY + 4,
    head: [["Date", "Expense Title", "Category", "Paid By", "Amount"]],
    body: expenseRows,
    theme: "grid",
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  // Footer / Page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Trip Expense Splitter  •  Page ${i} of ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }

  const cleanTitle = (trip.title || "trip").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${cleanTitle}_Expense_Report_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}
