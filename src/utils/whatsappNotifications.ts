import { Expense, Member, Payment, Trip } from "../types";
import { money, formatDate } from "./calculations";

/**
 * Normalizes a phone number to a clean WhatsApp international number.
 * e.g., "+91 98765 43210" -> "919876543210"
 * "9876543210" -> "919876543210" (defaults to India 91 if 10 digits)
 */
export function normalizeWhatsAppPhone(phone?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }

  return digits;
}

/**
 * Validates whether a given string is a valid WhatsApp phone number (at least 10 digits).
 */
export function isValidWhatsAppPhone(phone?: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Generates an invitation WhatsApp message to join a trip.
 */
export function generateTripInviteWhatsAppMsg(
  trip: Trip,
  inviterName: string,
  inviteLink: string,
  inviteCode: string
): string {
  let msg = `✈️ *Join our travel group on Trip Expense Splitter!*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏷️ *Trip:* ${trip.title}\n`;
  msg += `📍 *Destination:* ${trip.location}\n`;
  msg += `👤 *Invited by:* ${inviterName}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔗 *Join Link:*\n${inviteLink}\n\n`;
  msg += `🔑 *Trip Invite Code:* \`${inviteCode}\`\n\n`;
  msg += `Tap the link to join the group and track shared travel expenses!`;
  return msg;
}

/**
 * Direct WhatsApp URL to a specific phone number.
 */
export function getWhatsAppDirectLink(phone: string, text: string): string {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * General WhatsApp share URL (user chooses chat/group in WhatsApp).
 */
export function getWhatsAppShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Generates formatted WhatsApp notification text when a new expense is added.
 */
export function generateExpenseAddedWhatsAppMsg(
  trip: Trip,
  expense: Expense,
  creatorName: string
): string {
  const payer = trip.members.find((m) => m.id === expense.paidBy)?.name || "Someone";
  const splitBreakdown = Object.entries(expense.splits)
    .filter(([, amt]) => amt > 0)
    .map(([pid, amt]) => {
      const name = trip.members.find((m) => m.id === pid)?.name || pid;
      return `   • ${name}: ${money(amt)}`;
    })
    .join("\n");

  let msg = `🧾 *[${trip.title}]* ➕ *New Expense Added*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏷️ *Expense:* ${expense.title}\n`;
  msg += `💰 *Total Amount:* ${money(expense.amount)}\n`;
  msg += `👤 *Paid by:* ${payer}\n`;
  msg += `📂 *Category:* ${expense.category}\n`;
  msg += `📅 *Date:* ${formatDate(expense.date)}\n`;
  msg += `👥 *Split Type:* ${expense.method.toUpperCase()} (${expense.participants.length} people)\n`;
  msg += `\n📊 *Individual Shares:*\n${splitBreakdown}\n`;

  if (expense.notes) {
    msg += `\n📝 *Notes:* "${expense.notes}"\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✨ *Logged by:* ${creatorName}\n`;
  msg += `📲 *Open Trip:* View balances & settle in SplitTrip`;

  return msg;
}

/**
 * Generates formatted WhatsApp notification text when an expense is updated.
 */
export function generateExpenseUpdatedWhatsAppMsg(
  trip: Trip,
  expense: Expense,
  updaterName: string
): string {
  const payer = trip.members.find((m) => m.id === expense.paidBy)?.name || "Someone";

  let msg = `🧾 *[${trip.title}]* ✏️ *Expense Updated*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏷️ *Expense:* ${expense.title}\n`;
  msg += `💰 *New Amount:* ${money(expense.amount)}\n`;
  msg += `👤 *Paid by:* ${payer}\n`;
  msg += `📂 *Category:* ${expense.category}\n`;
  msg += `📅 *Date:* ${formatDate(expense.date)}\n`;
  if (expense.notes) {
    msg += `📝 *Notes:* "${expense.notes}"\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✏️ *Updated by:* ${updaterName}\n`;
  msg += `📲 Check recalculated balances in SplitTrip`;

  return msg;
}

/**
 * Generates formatted WhatsApp notification text when an expense is deleted.
 */
export function generateExpenseDeletedWhatsAppMsg(
  trip: Trip,
  expense: Expense,
  deleterName: string
): string {
  const payer = trip.members.find((m) => m.id === expense.paidBy)?.name || "Someone";

  let msg = `🧾 *[${trip.title}]* 🗑️ *Expense Deleted*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏷️ *Expense:* ${expense.title}\n`;
  msg += `💰 *Amount Removed:* ${money(expense.amount)}\n`;
  msg += `👤 *Originally Paid by:* ${payer}\n`;
  msg += `📂 *Category:* ${expense.category}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⚠️ *Deleted by:* ${deleterName}\n`;
  msg += `ℹ️ This expense has been moved to trash and removed from debt calculations.`;

  return msg;
}

/**
 * Generates formatted WhatsApp notification text when a debt payment/settlement is recorded.
 */
export function generateSettlementWhatsAppMsg(
  trip: Trip,
  payment: Payment,
  recorderName: string
): string {
  const fromName = trip.members.find((m) => m.id === payment.from)?.name || "Someone";
  const toName = trip.members.find((m) => m.id === payment.to)?.name || "Someone";
  const isConfirmed = payment.status === "PAID" || payment.status === "confirmed";

  let msg = `🤝 *[${trip.title}]* 💸 *Payment Settlement Recorded*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Paid by (Debtor):* ${fromName}\n`;
  msg += `👤 *Paid to (Creditor):* ${toName}\n`;
  msg += `💰 *Amount Settled:* ${money(payment.amount)}\n`;
  msg += `📌 *Status:* ${isConfirmed ? "✅ Confirmed" : "⏳ Recorded"}\n`;
  if (payment.note) {
    msg += `📝 *Note:* "${payment.note}"\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✨ *Recorded by:* ${recorderName}\n`;
  msg += `📲 Balances updated in SplitTrip`;

  return msg;
}

/**
 * Generates an individual personalized WhatsApp notification for a specific participant of an expense.
 */
export function generateIndividualExpenseWhatsAppMsg(
  trip: Trip,
  expense: Expense,
  recipientMember: Member,
  creatorName: string
): string {
  const payer = trip.members.find((m) => m.id === expense.paidBy);
  const payerName = payer?.name || "Someone";
  const isPayer = recipientMember.id === expense.paidBy;
  const myShare = expense.splits[recipientMember.id] || 0;

  let msg = `👋 *Hi ${recipientMember.name}!*\n`;
  msg += `📌 *[${trip.title}]* Expense Notice\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏷️ *Expense:* ${expense.title}\n`;
  msg += `💰 *Total Bill:* ${money(expense.amount)}\n`;
  msg += `📂 *Category:* ${expense.category} | 📅 ${formatDate(expense.date)}\n`;
  msg += `👤 *Paid by:* ${payerName}${isPayer ? " (You)" : ""}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

  if (isPayer) {
    const othersShare = expense.amount - myShare;
    msg += `✨ *Your Role:* You paid the full upfront amount.\n`;
    msg += `📊 *Your consumed share:* ${money(myShare)}\n`;
    if (othersShare > 0) {
      msg += `📥 *To be reimbursed by others:* ${money(othersShare)}\n`;
    }
  } else if (myShare > 0) {
    msg += `👉 *YOUR SHARE TO PAY:* *${money(myShare)}*\n`;
    if (payer?.phone) {
      msg += `📱 *${payerName}'s Phone:* ${payer.phone}\n`;
    }
  } else {
    msg += `ℹ️ *Status:* You are not split on this expense (₹0 share).\n`;
  }

  if (expense.notes) {
    msg += `📝 *Notes:* "${expense.notes}"\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✍️ *Logged by:* ${creatorName}\n`;
  msg += `📲 Track live balances on SplitTrip`;

  return msg;
}

/**
 * Generates an individual personalized debt reminder WhatsApp message to a debtor.
 */
export function generateIndividualDebtReminderWhatsAppMsg(
  trip: Trip,
  debtor: Member,
  creditor: Member,
  amount: number,
  customNote?: string
): string {
  let msg = `👋 *Hi ${debtor.name}!*\n`;
  msg += `🔔 *Payment Reminder for [${trip.title}]*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 *Outstanding Balance:* *${money(amount)}*\n`;
  msg += `👤 *Owed to:* ${creditor.name}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

  if (creditor.phone) {
    msg += `📱 *WhatsApp/Phone:* ${creditor.phone}\n`;
  }

  if (customNote) {
    msg += `📝 *Note:* "${customNote}"\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✨ Please settle with ${creditor.name} and mark as recorded in SplitTrip. Thank you! 🙏`;

  return msg;
}

/**
 * Generates an individual personalized balance & debt sheet summary for a single member.
 */
export function generateIndividualBalanceSummaryWhatsAppMsg(
  trip: Trip,
  member: Member,
  paid: number,
  share: number,
  net: number,
  debtsOwed: Array<{ creditor: Member; amount: number }>,
  debtsReceivable: Array<{ debtor: Member; amount: number }>
): string {
  const isOwed = net > 0.01;
  const owes = net < -0.01;

  let msg = `👋 *Hi ${member.name}!*\n`;
  msg += `📊 *Your Personal Summary for [${trip.title}]*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💵 *Total You Paid (Upfront):* ${money(paid)}\n`;
  msg += `🧾 *Your Consumed Share:* ${money(share)}\n`;

  if (isOwed) {
    msg += `🟢 *Net Status:* *You are owed ${money(net)}*\n`;
  } else if (owes) {
    msg += `🔴 *Net Status:* *You owe ${money(Math.abs(net))}*\n`;
  } else {
    msg += `⚪ *Net Status:* *You are fully settled up (₹0)*\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

  if (debtsOwed.length > 0) {
    msg += `\n💸 *Who You Need to Pay:*\n`;
    debtsOwed.forEach((d) => {
      msg += `  • *${d.creditor.name}:* ${money(d.amount)}\n`;
    });
  }

  if (debtsReceivable.length > 0) {
    msg += `\n💰 *Who Owes You:*\n`;
    debtsReceivable.forEach((d) => {
      msg += `  • *${d.debtor.name}:* ${money(d.amount)}\n`;
    });
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📲 Open SplitTrip to record or confirm payments!`;

  return msg;
}
