/**
 * @lavora/calendar — Google Calendar sync.
 *
 * Strategy: shared service account, per-clinic calendar ID.
 * Each clinic creates its own Google Calendar in OUR Google project,
 * shares it with our service-account email (clinic-bot@…), and stores
 * the calendar ID on its `clinics` row. We then write events into it
 * so the receptionist sees bookings in their phone's Google Calendar
 * app like any other event.
 *
 * Why service account vs per-clinic OAuth:
 *   - One credential to manage and rotate.
 *   - No expiring refresh tokens to babysit.
 *   - Onboarding is a single share action vs an OAuth dance.
 * Trade-off: clinic owner doesn't see the calendar in their own
 * Google account UI by default — they have to "Add by URL" or accept
 * a share invite. We handle that during onboarding.
 */

import { google } from "googleapis";
import { JWT } from "google-auth-library";

import type { Appointment, Clinic, Doctor, Service } from "@lavora/db";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

let _client: ReturnType<typeof google.calendar> | null = null;
let _auth: JWT | null = null;

function getCalendar() {
  if (_client) return _client;

  const b64 = process.env.GOOGLE_CREDENTIALS_JSON_B64;
  if (!b64) {
    throw new Error(
      "GOOGLE_CREDENTIALS_JSON_B64 not set — calendar sync is disabled.",
    );
  }
  const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));

  _auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
  });
  _client = google.calendar({ version: "v3", auth: _auth });
  return _client;
}

export interface CreateEventInput {
  clinic: Clinic;
  appointment: Appointment;
  service: Service;
  doctor: Doctor | null;
  clientName: string;
  clientPhone: string;
}

export async function createCalendarEvent(input: CreateEventInput): Promise<string> {
  if (!input.clinic.gcalEnabled || !input.clinic.gcalCalendarId) {
    return "";
  }
  const cal = getCalendar();

  const summary = input.doctor
    ? `[${input.service.department}] ${input.service.nameEn} - ${input.clientName} (${input.doctor.name})`
    : `[${input.service.department}] ${input.service.nameEn} - ${input.clientName}`;

  const description = [
    `Client: ${input.clientName}`,
    `Phone: ${input.clientPhone}`,
    `Service: ${input.service.nameEn}`,
    `Duration: ${input.service.durationMinutes} min`,
    `Source: ${input.appointment.source}`,
    input.doctor ? `Doctor: ${input.doctor.name}` : "",
    input.appointment.notes ? `Notes: ${input.appointment.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await cal.events.insert({
    calendarId: input.clinic.gcalCalendarId,
    requestBody: {
      summary,
      description,
      start: {
        dateTime: input.appointment.startAt.toISOString(),
        timeZone: input.clinic.timezone,
      },
      end: {
        dateTime: input.appointment.endAt.toISOString(),
        timeZone: input.clinic.timezone,
      },
    },
  });

  return res.data.id ?? "";
}

export async function cancelCalendarEvent(opts: {
  clinic: Clinic;
  gcalEventId: string;
}): Promise<void> {
  if (!opts.clinic.gcalEnabled || !opts.clinic.gcalCalendarId || !opts.gcalEventId) {
    return;
  }
  const cal = getCalendar();
  try {
    await cal.events.delete({
      calendarId: opts.clinic.gcalCalendarId,
      eventId: opts.gcalEventId,
    });
  } catch (err: any) {
    // 404/410 means the event was already gone — fine.
    if (err?.code === 404 || err?.code === 410) return;
    throw err;
  }
}
