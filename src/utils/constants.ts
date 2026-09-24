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
}

export const CATEGORY_META: Record<string, CategoryInfo> = {
  Food: { icon: UtensilsCrossed, color: "#C2543A", label: "Food" },
  Accommodation: { icon: Home, color: "#7B5EA7", label: "Accommodation" },
  Transport: { icon: Car, color: "#2A7FA6", label: "Transport" },
  Tickets: { icon: Ticket, color: "#A44A7A", label: "Tickets" },
  Shopping: { icon: ShoppingBag, color: "#C77F1C", label: "Shopping" },
  Entertainment: { icon: Drama, color: "#9333EA", label: "Entertainment" },
  Fuel: { icon: Fuel, color: "#B4841F", label: "Fuel" },
  Hotel: { icon: Hotel, color: "#7B5EA7", label: "Accommodation" },
  Travel: { icon: Car, color: "#2A7FA6", label: "Transport" },
  Train: { icon: Train, color: "#0F6B65", label: "Transport" },
  Flight: { icon: Plane, color: "#3B6FA0", label: "Transport" },
  Bus: { icon: Bus, color: "#5B8A3A", label: "Transport" },
  Taxi: { icon: Car, color: "#946B2D", label: "Transport" },
  Other: { icon: Package, color: "#5B6478", label: "Other" },
};

export const PRIMARY_CATEGORIES = [
  "Food",
  "Accommodation",
  "Transport",
  "Tickets",
  "Shopping",
  "Entertainment",
  "Fuel",
  "Other"
];

export const CATEGORIES = PRIMARY_CATEGORIES;
