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

function escapeXml(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colIndexToLetter(colIdx: number): string {
  let letter = "";
  let n = colIdx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function buildWorksheetXml(rows: (string | number | undefined | null)[][], colWidths: number[]): string {
  const colsXml =
    colWidths.length > 0
      ? `<cols>${colWidths
          .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
          .join("")}</cols>`
      : "";
  const sheetDataXml = rows
    .map((row, rIdx) => {
      const cells = row
        .map((cell, cIdx) => {
          if (cell === undefined || cell === null || cell === "") return "";
          const ref = `${colIndexToLetter(cIdx)}${rIdx + 1}`;
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rIdx + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colsXml}<sheetData>${sheetDataXml}</sheetData></worksheet>`;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildStoredZip(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.content);
    return { nameBytes, dataBytes, crc: crc32(dataBytes) };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const e of entries) {
    localSize += 30 + e.nameBytes.length + e.dataBytes.length;
    centralSize += 46 + e.nameBytes.length;
  }

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let localOffset = 0;
  let centralOffset = localSize;

  for (const e of entries) {
    const entryOffset = localOffset;
    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 4, 20, true);
    view.setUint16(localOffset + 6, 0, true);
    view.setUint16(localOffset + 8, 0, true);
    view.setUint16(localOffset + 10, 0, true);
    view.setUint16(localOffset + 12, 0, true);
    view.setUint32(localOffset + 14, e.crc, true);
    view.setUint32(localOffset + 18, e.dataBytes.length, true);
    view.setUint32(localOffset + 22, e.dataBytes.length, true);
    view.setUint16(localOffset + 26, e.nameBytes.length, true);
    view.setUint16(localOffset + 28, 0, true);
    out.set(e.nameBytes, localOffset + 30);
    out.set(e.dataBytes, localOffset + 30 + e.nameBytes.length);
    localOffset += 30 + e.nameBytes.length + e.dataBytes.length;

    view.setUint32(centralOffset, 0x02014b50, true);
    view.setUint16(centralOffset + 4, 20, true);
    view.setUint16(centralOffset + 6, 20, true);
    view.setUint16(centralOffset + 8, 0, true);
    view.setUint16(centralOffset + 10, 0, true);
    view.setUint16(centralOffset + 12, 0, true);
    view.setUint16(centralOffset + 14, 0, true);
    view.setUint32(centralOffset + 16, e.crc, true);
    view.setUint32(centralOffset + 20, e.dataBytes.length, true);
    view.setUint32(centralOffset + 24, e.dataBytes.length, true);
    view.setUint16(centralOffset + 28, e.nameBytes.length, true);
    view.setUint16(centralOffset + 30, 0, true);
    view.setUint16(centralOffset + 32, 0, true);
    view.setUint16(centralOffset + 34, 0, true);
    view.setUint16(centralOffset + 36, 0, true);
    view.setUint32(centralOffset + 38, 0, true);
    view.setUint32(centralOffset + 42, entryOffset, true);
    out.set(e.nameBytes, centralOffset + 46);
    centralOffset += 46 + e.nameBytes.length;
  }

  view.setUint32(centralOffset, 0x06054b50, true);
  view.setUint16(centralOffset + 4, 0, true);
  view.setUint16(centralOffset + 6, 0, true);
  view.setUint16(centralOffset + 8, entries.length, true);
  view.setUint16(centralOffset + 10, entries.length, true);
  view.setUint32(centralOffset + 12, centralSize, true);
  view.setUint32(centralOffset + 16, localSize, true);
  view.setUint16(centralOffset + 20, 0, true);

  return out;
}

/**
 * Generates and downloads a rich, multi-sheet Excel (.xlsx) workbook for the trip.
 */
export async function exportTripToExcel(
  trip: Trip,
  members: Member[],
  paidShare: Record<string, { paid: number; share: number }>,
  netBalances: Record<string, number>,
  simplifiedDebts: SimplifiedDebt[]
) {
  const memberMap = new Map(members.map((m) => [m.id, m.name]));
  const activeExpenses = (trip.expenses || []).filter((e) => !e.deleted);
  const totalSpend = activeExpenses.reduce((s, e) => s + e.amount, 0);

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

  const sheets = [
    { name: "Trip Overview & Balances", xml: buildWorksheetXml(overviewData, [22, 18, 18, 16, 16, 16, 22]) },
    { name: "Expenses Ledger", xml: buildWorksheetXml([expensesHeader, ...expensesData], [14, 28, 15, 14, 14, 18, 14, 40, 25]) },
    { name: "Settlements Matrix", xml: buildWorksheetXml([settlementsHeader, ...settlementsData], [20, 22, 14, 20]) },
  ];

  const zipBytes = buildStoredZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, idx) => `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((s, idx) => `<sheet name="${escapeXml(s.name)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, idx) => `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`).join("\n  ")}
</Relationships>`,
    },
    ...sheets.map((s, idx) => ({
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      content: s.xml,
    })),
  ]);

  const cleanTitle = (trip.title || "trip").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${cleanTitle}_Expense_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
  if (typeof document !== "undefined") {
    const blob = new Blob([zipBytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Generates and downloads a clean, beautifully formatted PDF audit report.
 */
export async function exportTripToPDF(
  trip: Trip,
  members: Member[],
  paidShare: Record<string, { paid: number; share: number }>,
  netBalances: Record<string, number>,
  simplifiedDebts: SimplifiedDebt[]
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

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
