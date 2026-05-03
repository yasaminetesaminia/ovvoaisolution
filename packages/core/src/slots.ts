/**
 * Slot computation — the "when can the caller come in" question.
 *
 * Ground rules:
 *  - Each Service has a `capacity` (concurrent appointments allowed).
 *  - Each Service may restrict to a list of doctors via `doctorIds`.
 *  - The clinic's working hours, closed weekday, and holiday list
 *    eliminate whole days or trim the day.
 *  - We walk in 15-minute increments; every increment where
 *      live_overlapping_count(service, slot) < service.capacity
 *    counts as available.
 *
 * Returns slot starts in "HH:MM" (clinic-local), grouped by part-of-day
 * so the receptionist can offer them naturally.
 */

import { prisma } from "@lavora/db";
import {
  addMin,
  localTimeToUtc,
  rangeOverlaps,
  utcToLocalDate,
  utcToLocalTime,
  utcToLocalWeekday,
} from "./time.js";

const STEP_MINUTES = 15;

export interface SlotQuery {
  clinicId: string;
  serviceKey: string;
  dateYmd: string; // YYYY-MM-DD in clinic-local time
  doctorId?: string;
}

export interface SlotResult {
  date: string;
  closed: boolean;
  reason?: string; // "friday" | "holiday" | "fully_booked" | undefined
  morning: string[]; // HH:MM
  afternoon: string[];
  evening: string[];
  total: number;
}

export async function findAvailableSlots(q: SlotQuery): Promise<SlotResult> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: q.clinicId },
    include: { holidays: { where: { date: new Date(q.dateYmd) } } },
  });

  const service = await prisma.service.findUniqueOrThrow({
    where: { clinicId_key: { clinicId: q.clinicId, key: q.serviceKey } },
  });

  const empty: SlotResult = {
    date: q.dateYmd,
    closed: true,
    morning: [],
    afternoon: [],
    evening: [],
    total: 0,
  };

  // Day-level closures
  const probeDay = localTimeToUtc(q.dateYmd, "12:00", clinic.timezone);
  const weekday = utcToLocalWeekday(probeDay, clinic.timezone);
  if (weekday.toLowerCase() === clinic.closedDay.toLowerCase()) {
    return { ...empty, reason: "closed_day" };
  }
  if (clinic.holidays.length > 0) {
    return { ...empty, reason: "holiday" };
  }

  // Working window in UTC
  const dayStart = localTimeToUtc(q.dateYmd, clinic.workingStart, clinic.timezone);
  const dayEnd = localTimeToUtc(q.dateYmd, clinic.workingEnd, clinic.timezone);

  // Existing same-day appointments for this department/service to check
  // capacity against. We pull all bookings in the day window for this
  // clinic, then filter in JS — Postgres index handles the date predicate.
  const sameDayAppts = await prisma.appointment.findMany({
    where: {
      clinicId: q.clinicId,
      status: "scheduled",
      startAt: { gte: dayStart, lt: dayEnd },
    },
    include: { service: true },
  });

  // Restrict to appointments that compete for the same capacity bucket.
  // Bucket = (department, doctorId-if-doctor-restricted).
  const sameBucket = sameDayAppts.filter((a) => {
    if (a.service.department !== service.department) return false;
    if (q.doctorId && a.doctorId !== q.doctorId) return false;
    return true;
  });

  const result: SlotResult = {
    date: q.dateYmd,
    closed: false,
    morning: [],
    afternoon: [],
    evening: [],
    total: 0,
  };

  const now = new Date();
  for (
    let cursor = new Date(dayStart);
    addMin(cursor, service.durationMinutes) <= dayEnd;
    cursor = addMin(cursor, STEP_MINUTES)
  ) {
    // Skip past slots on same-day requests
    if (cursor < now) continue;

    const slotEnd = addMin(cursor, service.durationMinutes);

    // Count overlaps
    const overlapping = sameBucket.filter((a) =>
      rangeOverlaps(cursor, slotEnd, a.startAt, a.endAt),
    ).length;

    if (overlapping >= service.capacity) continue;

    const hm = utcToLocalTime(cursor, clinic.timezone);
    const hour = parseInt(hm.split(":")[0]!, 10);
    if (hour < 12) result.morning.push(hm);
    else if (hour < 17) result.afternoon.push(hm);
    else result.evening.push(hm);
    result.total++;
  }

  if (result.total === 0) result.reason = "fully_booked";
  return result;
}

/** Walk forward from a date until we find a day with at least one slot,
 *  capped at `maxDays` lookahead so we don't spin forever on a permanently
 *  closed clinic.
 */
export async function findNextOpenDay(
  q: SlotQuery,
  maxDays: number = 14,
): Promise<SlotResult> {
  let date = new Date(q.dateYmd);
  for (let i = 0; i < maxDays; i++) {
    const ymd = utcToLocalDate(date, "UTC"); // already a UTC date here
    const slots = await findAvailableSlots({ ...q, dateYmd: ymd });
    if (slots.total > 0) return slots;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return {
    date: utcToLocalDate(date, "UTC"),
    closed: true,
    reason: "no_availability",
    morning: [],
    afternoon: [],
    evening: [],
    total: 0,
  };
}
