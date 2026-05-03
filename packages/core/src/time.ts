/**
 * Timezone-aware date helpers.
 *
 * The clinic's timezone (e.g. Asia/Dubai) drives every "is the clinic
 * open" / "is this slot today" question. JS Date is UTC under the hood,
 * so we lean on date-fns-tz to do the conversion explicitly — never
 * trust the server's local timezone.
 */

import { addMinutes, format, isAfter, isBefore, parse } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/** Parse "HH:MM" + a date in the clinic timezone → absolute UTC Date. */
export function localTimeToUtc(
  dateYmd: string, // "2026-05-10"
  timeHm: string, // "14:30"
  timezone: string,
): Date {
  const local = parse(`${dateYmd} ${timeHm}`, "yyyy-MM-dd HH:mm", new Date());
  return fromZonedTime(local, timezone);
}

/** Absolute Date → "HH:MM" in the clinic timezone. */
export function utcToLocalTime(d: Date, timezone: string): string {
  return format(toZonedTime(d, timezone), "HH:mm");
}

export function utcToLocalDate(d: Date, timezone: string): string {
  return format(toZonedTime(d, timezone), "yyyy-MM-dd");
}

export function utcToLocalWeekday(d: Date, timezone: string): string {
  return format(toZonedTime(d, timezone), "EEEE"); // "Friday"
}

export function addMin(d: Date, minutes: number): Date {
  return addMinutes(d, minutes);
}

/** True if `slot` ∈ [start, end) at minute granularity. */
export function rangeOverlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return isBefore(aStart, bEnd) && isAfter(aEnd, bStart);
}
