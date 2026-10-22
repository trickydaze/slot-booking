// POST /api/book: claims a slot. A slot can only be written once, so two
// people clicking the same slot at the same moment cannot both get it.
import {
  EVENT,
  RULES,
  buildSlots,
  slotKey,
  bookingsStore,
  listBookings,
  sendSummaryOnce,
  json,
} from "../lib/schedule.mjs";

const clean = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST to book a slot." }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "The booking request was not valid. Reload the page and try again." }, 400);
  }

  const slot = buildSlots().find((s) => s.id === Number(body.slotId));
  if (!slot) return json({ error: "That slot does not exist. Reload the page and pick again." }, 400);

  const group = clean(body.group, 20);
  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = clean(body.email, 120).toLowerCase();

  const missing = [];
  if (!group) missing.push("group number");
  if (!firstName) missing.push("first name");
  if (!lastName) missing.push("last name");
  if (!email) missing.push("email address");
  if (missing.length) return json({ error: `Fill in your ${missing.join(", ")}.`, code: "invalid" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address.", code: "invalid" }, 400);

  const store = bookingsStore();

  if (RULES.onePerEmail || RULES.onePerGroup) {
    const existing = await listBookings(store);
    const sameEmail = RULES.onePerEmail && existing.find((b) => b.email === email);
    if (sameEmail) {
      return json(
        { error: `${email} already has the ${sameEmail.start}–${sameEmail.end} slot. Each person can book one slot.`, code: "duplicate" },
        409
      );
    }
    const sameGroup = RULES.onePerGroup && existing.find((b) => b.group.toLowerCase() === group.toLowerCase());
    if (sameGroup) {
      return json(
        { error: `Group ${group} already has the ${sameGroup.start}–${sameGroup.end} slot. Each group can book one slot.`, code: "duplicate" },
        409
      );
    }
  }

  const booking = {
    slotId: slot.id,
    start: slot.start,
    end: slot.end,
    group,
    firstName,
    lastName,
    email,
    bookedAt: new Date().toISOString(),
  };

  const { modified } = await store.setJSON(slotKey(slot.id), booking, { onlyIfNew: true });
  if (!modified) {
    return json({ error: `Someone else just booked ${slot.start}–${slot.end}. Pick another slot.`, code: "taken" }, 409);
  }

  // Once every slot is booked, email the full list.
  try {
    const all = await listBookings(store);
    if (all.length >= EVENT.slotCount) await sendSummaryOnce(store, all);
  } catch (err) {
    console.error("Completion check failed:", err.message);
  }

  return json({
    ok: true,
    booking: { slotId: slot.id, start: slot.start, end: slot.end, date: EVENT.date, dateLabel: EVENT.dateLabel, group, firstName, lastName },
  });
};

export const config = { path: "/api/book" };
