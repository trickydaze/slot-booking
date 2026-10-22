// GET /api/slots: the day's slots and which are taken (no personal data).
import { EVENT, buildSlots, slotKey, bookingsStore, json } from "../lib/schedule.mjs";

export default async () => {
  const { blobs } = await bookingsStore().list({ prefix: "slot-" });
  const taken = new Set(blobs.map((b) => b.key));
  const slots = buildSlots().map((s) => ({ ...s, taken: taken.has(slotKey(s.id)) }));
  return json({
    title: EVENT.title,
    dateLabel: EVENT.dateLabel,
    date: EVENT.date,
    slotMinutes: EVENT.slotMinutes,
    breakMinutes: EVENT.breakMinutes,
    slots,
    remaining: slots.filter((s) => !s.taken).length,
  });
};

export const config = { path: "/api/slots" };
