// POST /api/admin: used by admin.html. Requires the ADMIN_KEY environment variable.
// Actions: list, email (send the list now), release (free one slot), reset (free all).
import { timingSafeEqual } from "node:crypto";
import { EVENT, slotKey, SUMMARY_KEY, bookingsStore, listBookings, sendSummary, json } from "../lib/schedule.mjs";

const env = (key) => globalThis.Netlify?.env?.get(key) ?? process.env[key];

function keyMatches(given) {
  const expected = env("ADMIN_KEY");
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!env("ADMIN_KEY")) return json({ error: "ADMIN_KEY is not set in the Netlify environment variables." }, 503);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!keyMatches(body.key)) return json({ error: "Wrong admin key." }, 401);

  const store = bookingsStore();

  if (body.action === "email") {
    try {
      const result = await sendSummary(await listBookings(store));
      return json({ ok: true, message: `Email sent to ${env("NOTIFY_EMAIL") || "540144@umons.ac.be"}.`, id: result.id });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  }

  if (body.action === "release") {
    const id = Number(body.slotId);
    if (!Number.isInteger(id) || id < 1 || id > EVENT.slotCount) return json({ error: "Unknown slot." }, 400);
    await store.delete(slotKey(id));
    await store.delete(SUMMARY_KEY); // so the email goes out again once the day is full
    return json({ ok: true, message: "Slot freed." });
  }

  if (body.action === "reset") {
    const { blobs } = await store.list();
    await Promise.all(blobs.map((b) => store.delete(b.key)));
    return json({ ok: true, message: "All bookings cleared." });
  }

  const bookings = await listBookings(store);
  const summary = await store.get(SUMMARY_KEY, { type: "json" });
  return json({
    dateLabel: EVENT.dateLabel,
    slotCount: EVENT.slotCount,
    bookings,
    summarySentAt: summary?.at ?? null,
  });
};

export const config = { path: "/api/admin" };
