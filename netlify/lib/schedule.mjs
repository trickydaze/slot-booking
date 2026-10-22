// Shared settings and helpers for the booking functions.
// Change the day, times or rules here; the page reads everything from /api/slots.
import { getStore } from "@netlify/blobs";

export const EVENT = {
  title: "1:1 slots",
  dateLabel: "Thursday 17 December 2026",
  date: "2026-12-17",
  firstStart: "09:00", // local time, Europe/Brussels
  slotMinutes: 15,
  breakMinutes: 5,
  slotCount: 14,
};

export const RULES = {
  onePerEmail: true, // the same email address cannot book two slots
  onePerGroup: false, // set to true if each group may hold only one slot
};

const env = (key) => globalThis.Netlify?.env?.get(key) ?? process.env[key];
const pad = (n) => String(n).padStart(2, "0");
const toClock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export function buildSlots() {
  const [h, m] = EVENT.firstStart.split(":").map(Number);
  const first = h * 60 + m;
  const step = EVENT.slotMinutes + EVENT.breakMinutes;
  return Array.from({ length: EVENT.slotCount }, (_, i) => {
    const start = first + i * step;
    return { id: i + 1, start: toClock(start), end: toClock(start + EVENT.slotMinutes) };
  });
}

export const slotKey = (id) => `slot-${pad(id)}`;
export const SUMMARY_KEY = "meta-summary-sent";

export const bookingsStore = () => getStore({ name: "bookings", consistency: "strong" });

export async function listBookings(store) {
  const { blobs } = await store.list({ prefix: "slot-" });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => a.slotId - b.slotId);
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function summaryContent(bookings) {
  const bySlot = new Map(bookings.map((b) => [b.slotId, b]));
  const rows = buildSlots().map((s) => ({ slot: s, booking: bySlot.get(s.id) }));
  const complete = bookings.length >= EVENT.slotCount;

  const subject = complete
    ? `All ${EVENT.slotCount} slots booked for ${EVENT.dateLabel}`
    : `Slot bookings so far (${bookings.length} of ${EVENT.slotCount}) for ${EVENT.dateLabel}`;

  const text = [
    `${EVENT.title}, ${EVENT.dateLabel}`,
    "",
    ...rows.map(({ slot, booking: b }) =>
      b
        ? `${slot.start}-${slot.end}  Group ${b.group}  ${b.firstName} ${b.lastName}  <${b.email}>`
        : `${slot.start}-${slot.end}  (free)`
    ),
  ].join("\n");

  const cell = 'style="padding:6px 12px;border-bottom:1px solid #ddd;text-align:left"';
  const html = `<p>${escapeHtml(EVENT.title)}, ${escapeHtml(EVENT.dateLabel)}</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
<thead><tr><th ${cell}>Time</th><th ${cell}>Group</th><th ${cell}>Name</th><th ${cell}>Email</th></tr></thead>
<tbody>${rows
    .map(({ slot, booking: b }) =>
      b
        ? `<tr><td ${cell}>${slot.start}-${slot.end}</td><td ${cell}>${escapeHtml(b.group)}</td><td ${cell}>${escapeHtml(
            `${b.firstName} ${b.lastName}`
          )}</td><td ${cell}>${escapeHtml(b.email)}</td></tr>`
        : `<tr><td ${cell}>${slot.start}-${slot.end}</td><td ${cell} colspan="3">(free)</td></tr>`
    )
    .join("")}</tbody></table>`;

  return { subject, text, html };
}

export async function sendSummary(bookings) {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set in the Netlify environment variables.");
  const to = env("NOTIFY_EMAIL") || "parry.dilara@gmail.com";
  const from = env("MAIL_FROM") || "Slot booking <onboarding@resend.dev>";
  const { subject, text, html } = summaryContent(bookings);

  const res = await fetch(env("RESEND_API_URL") || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
  return res.json();
}

// Sends the summary once, even if two last bookings land at the same moment.
// If sending fails, the lock is removed so the admin page can retry.
export async function sendSummaryOnce(store, bookings) {
  const { modified } = await store.setJSON(SUMMARY_KEY, { at: new Date().toISOString() }, { onlyIfNew: true });
  if (!modified) return { sent: false, reason: "already sent" };
  try {
    const result = await sendSummary(bookings);
    return { sent: true, id: result.id };
  } catch (err) {
    await store.delete(SUMMARY_KEY);
    console.error("Summary email failed:", err.message);
    return { sent: false, reason: err.message };
  }
}
