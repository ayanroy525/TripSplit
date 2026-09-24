import {
  Hotel,
  UtensilsCrossed,
  Car,
  Fuel,
  Train,
  Plane,
  Bus,
  Ticket,
  ShoppingBag,
  Drama,
  Package,
  Home,
  LucideIcon
} from "lucide-react";

export const C = {
  ink: "var(--c-ink, #0F172A)",
  inkSoft: "var(--c-inkSoft, #64748B)",
  paper: "var(--c-paper, #F8F9FA)",
  paperDark: "var(--c-paperDark, #F1F3F5)",
  card: "var(--c-card, #FFFFFF)",
  marigold: "var(--c-marigold, #D97706)",
  marigoldDark: "var(--c-marigoldDark, #B45309)",
  teal: "var(--c-teal, #0F6B65)",
  tealSoft: "var(--c-tealSoft, #E6F4F2)",
  tealDark: "var(--c-tealDark, #0B4F4B)",
  rust: "var(--c-rust, #DC2626)",
  rustSoft: "var(--c-rustSoft, #FEE2E2)",
  positive: "var(--c-positive, #16A34A)",
  positiveSoft: "var(--c-positiveSoft, #DCFCE7)",
  line: "var(--c-line, #E2E8F0)",
  lineSoft: "var(--c-lineSoft, #F1F5F9)",
  badgeYellowBg: "var(--c-badge-yellow-bg, #FEF3C7)",
  badgeYellowText: "var(--c-badge-yellow-text, #92400E)",
  modalOverlay: "var(--c-modal-overlay, rgba(15, 23, 42, 0.6))",
  inputBg: "var(--c-input-bg, #FFFFFF)",
  btnSettleBg: "var(--c-btn-settle-bg, #0F6B65)",
  btnSettleText: "var(--c-btn-settle-text, #FFFFFF)",
  badgeBrandBg: "var(--c-badge-brand-bg, #0F6B65)",
  badgeBrandText: "var(--c-badge-brand-text, #FFFFFF)",
  tealContrastText: "var(--c-teal-contrast-text, #FFFFFF)",
  waBg: "#25D36615",
  waBorder: "#25D36640",
  waText: "#128C7E",
  saffron: "#E39A2D",
  purple: "#7B5EA7",
};

export const AVATAR_COLORS: Record<string, string> = {
  m1: "#E39A2D",
  m2: "#0F6B65",
  m3: "#C2543A",
  m4: "#7B5EA7",
  m5: "#2A7FA6",
  m6: "#D97706",
  m7: "#059669",
  m8: "#DC2626",
};

export const PRESET_AVATAR_PALETTE = [
  "#E39A2D", "#0F6B65", "#C2543A", "#7B5EA7", "#2A7FA6",
  "#D97706", "#059669", "#DC2626", "#4B5563", "#0284C7"
];

export interface CategoryInfo {
  icon: LucideIcon;
  color: string;
  label: string;
  bg?: string;
  text?: string;
}

export const CATEGORY_META: Record<string, CategoryInfo> = {
  Food: { icon: UtensilsCrossed, color: "#C2543A", label: "Food", bg: "#FEF3C7", text: "#92400E" },
  Accommodation: { icon: Home, color: "#7B5EA7", label: "Accommodation", bg: "#E0E7FF", text: "#3730A3" },
  Transport: { icon: Car, color: "#2A7FA6", label: "Transport", bg: "#DBEAFE", text: "#1E40AF" },
  Travel: { icon: Car, color: "#2A7FA6", label: "Travel", bg: "#DBEAFE", text: "#1E40AF" },
  Train: { icon: Train, color: "#0F6B65", label: "Train", bg: "#E6F4F2", text: "#0B4F4B" },
  "Train ticket": { icon: Train, color: "#0F6B65", label: "Train ticket", bg: "#E6F4F2", text: "#0B4F4B" },
  Flight: { icon: Plane, color: "#3B6FA0", label: "Flight", bg: "#E0F2FE", text: "#0369A1" },
  Bus: { icon: Bus, color: "#5B8A3A", label: "Bus", bg: "#DCFCE7", text: "#15803D" },
  Taxi: { icon: Car, color: "#946B2D", label: "Taxi", bg: "#FEF3C7", text: "#854D0E" },
  Tickets: { icon: Ticket, color: "#A44A7A", label: "Tickets", bg: "#FCE7F3", text: "#9D174D" },
  Activities: { icon: Ticket, color: "#9D174D", label: "Activities", bg: "#FCE7F3", text: "#9D174D" },
  Shopping: { icon: ShoppingBag, color: "#C77F1C", label: "Shopping", bg: "#F3E8FF", text: "#6B21A8" },
  Entertainment: { icon: Drama, color: "#9333EA", label: "Entertainment", bg: "#F3E8FF", text: "#6B21A8" },
  Groceries: { icon: Package, color: "#166534", label: "Groceries", bg: "#DCFCE7", text: "#166534" },
  Fuel: { icon: Fuel, color: "#B4841F", label: "Fuel", bg: "#FEF3C7", text: "#B45309" },
  Hotel: { icon: Hotel, color: "#7B5EA7", label: "Hotel", bg: "#E0E7FF", text: "#3730A3" },
  Other: { icon: Package, color: "#5B6478", label: "Other", bg: "#F1F5F9", text: "#334155" },
  Others: { icon: Package, color: "#5B6478", label: "Others", bg: "#F1F5F9", text: "#334155" },
};

/**
 * Resolves category info with smart auto-detection from title.
 * Prevents titles like "Train ticket" or "Travel" from displaying as "Food".
 */
export function getCategoryMeta(category?: string, title?: string): CategoryInfo & { bg: string; text: string; resolvedCategory: string } {
  const t = (title || "").trim().toLowerCase();
  const c = (category || "").trim();
  const cLower = c.toLowerCase();

  // 1. Train / Railway detection
  if (
    t.includes("train") ||
    t.includes("railway") ||
    t.includes("irctc") ||
    t.includes("rail") ||
    t.includes("metro") ||
    cLower === "train" ||
    cLower === "train ticket"
  ) {
    const meta = CATEGORY_META["Train"];
    return {
      ...meta,
      bg: meta.bg || "#E6F4F2",
      text: meta.text || "#0B4F4B",
      resolvedCategory: cLower === "train ticket" || t.includes("train ticket") ? "Train ticket" : "Train",
    };
  }

  // 2. Flight / Air detection
  if (t.includes("flight") || t.includes("airplane") || t.includes("airline") || t.includes("boarding pass") || cLower === "flight") {
    const meta = CATEGORY_META["Flight"];
    return {
      ...meta,
      bg: meta.bg || "#E0F2FE",
      text: meta.text || "#0369A1",
      resolvedCategory: "Flight",
    };
  }

  // 3. Travel / Transport / Fuel / Bus / Cab detection
  if (
    t.includes("travel") ||
    t.includes("transport") ||
    t.includes("cab") ||
    t.includes("taxi") ||
    t.includes("uber") ||
    t.includes("ola") ||
    t.includes("bus") ||
    t.includes("petrol") ||
    t.includes("diesel") ||
    t.includes("toll") ||
    cLower === "travel" ||
    cLower === "transport" ||
    cLower === "taxi" ||
    cLower === "bus" ||
    cLower === "fuel"
  ) {
    const isFuel = t.includes("petrol") || t.includes("diesel") || cLower === "fuel";
    const meta = isFuel ? CATEGORY_META["Fuel"] : cLower === "travel" || t.includes("travel") ? CATEGORY_META["Travel"] : CATEGORY_META["Transport"];
    return {
      ...meta,
      bg: meta.bg || "#DBEAFE",
      text: meta.text || "#1E40AF",
      resolvedCategory: isFuel ? "Fuel" : (cLower === "travel" || t.includes("travel") ? "Travel" : "Transport"),
    };
  }

  // 4. Hotel / Stay / Accommodation detection
  if (
    t.includes("hotel") ||
    t.includes("resort") ||
    t.includes("stay") ||
    t.includes("airbnb") ||
    t.includes("hostel") ||
    t.includes("room") ||
    t.includes("villa") ||
    t.includes("lodge") ||
    cLower === "accommodation" ||
    cLower === "hotel"
  ) {
    const meta = CATEGORY_META["Accommodation"];
    return {
      ...meta,
      bg: meta.bg || "#E0E7FF",
      text: meta.text || "#3730A3",
      resolvedCategory: "Accommodation",
    };
  }

  // 5. Sightseeing / Tickets detection
  if (t.includes("ticket") || t.includes("entry") || t.includes("museum") || t.includes("monument") || t.includes("safari") || cLower === "tickets" || cLower === "activities") {
    const meta = CATEGORY_META["Tickets"];
    return {
      ...meta,
      bg: meta.bg || "#FCE7F3",
      text: meta.text || "#9D174D",
      resolvedCategory: cLower === "activities" ? "Activities" : "Tickets",
    };
  }

  // 6. Direct match by category key
  if (c && CATEGORY_META[c]) {
    const meta = CATEGORY_META[c];
    return {
      ...meta,
      bg: meta.bg || `${meta.color}15`,
      text: meta.text || meta.color,
      resolvedCategory: c,
    };
  }

  // Fallback to Other
  const fallback = CATEGORY_META["Other"];
  return {
    ...fallback,
    bg: "#F1F5F9",
    text: "#334155",
    resolvedCategory: c || "Other",
  };
}

export const PRIMARY_CATEGORIES = [
  "Food",
  "Transport",
  "Travel",
  "Train",
  "Accommodation",
  "Tickets",
  "Activities",
  "Shopping",
  "Entertainment",
  "Fuel",
  "Other"
];

export const CATEGORIES = PRIMARY_CATEGORIES;
