/**
 * In-process reminder dispatcher.
 *
 * Wakes every RUN_INTERVAL_MS, finds reminders whose scheduledFor has
 * passed, sends the WhatsApp text, marks the row as `sent` (or `failed`
 * with the error and an attempts count). Idempotency is enforced by
 * the unique index on (appointmentId, channel) plus the status guard
 * — sending will never double-fire for the same appointment+channel.
 *
 * Why in-process and not Trigger.dev/Vercel Cron:
 *   - Railway keeps the api process alive 24/7.
 *   - 1 reminder/min throughput is generous for a multi-tenant demo.
 *   - One less moving piece during the 7-day build.
 *
 * Production-grade alternative (post-MVP): swap this for Trigger.dev or
 * Inngest so reminders survive process restarts cleanly.
 */

import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { renderReminderText, sendWhatsAppText } from "@lavora/chat";
import { prisma } from "@lavora/db";

import { logger } from "./logger.js";

const RUN_INTERVAL_MS = 60_000; // every minute
const BATCH_LIMIT = 25; // send at most 25 per tick to stay polite

let started = false;

export function startReminderRunner(): void {
  if (started) return;
  started = true;
  logger.info("reminder.runner.started");
  // Fire once on startup, then on a fixed interval.
  void tick();
  setInterval(() => void tick(), RUN_INTERVAL_MS);
}

async function tick(): Promise<void> {
  const now = new Date();
  let due: Awaited<ReturnType<typeof fetchDue>>;
  try {
    due = await fetchDue(now);
  } catch (err) {
    logger.error({ err }, "reminder.fetch.failed");
    return;
  }
  if (due.length === 0) return;

  logger.info({ count: due.length }, "reminder.batch");
  for (const r of due) {
    await processOne(r).catch((err) =>
      logger.error({ err, reminderId: r.id }, "reminder.send.failed"),
    );
  }
}

function fetchDue(now: Date) {
  return prisma.reminder.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    take: BATCH_LIMIT,
    orderBy: { scheduledFor: "asc" },
    include: {
      clinic: true,
      appointment: {
        include: { service: true, doctor: true, client: true },
      },
    },
  });
}

async function processOne(
  r: Awaited<ReturnType<typeof fetchDue>>[number],
): Promise<void> {
  // Guard against the appointment having been cancelled between schedule and tick.
  if (r.appointment.status !== "scheduled") {
    await prisma.reminder.update({
      where: { id: r.id },
      data: { status: "cancelled" },
    });
    return;
  }

  const lang = (r.appointment.client.language as "en" | "ar") ?? "en";
  const startLocal = toZonedTime(r.appointment.startAt, r.clinic.timezone);
  const formatted =
    lang === "ar"
      ? format(startLocal, "EEEE d/M HH:mm")
      : format(startLocal, "EEEE d MMM, HH:mm");

  const text = renderReminderText({
    clinicName: r.clinic.name,
    serviceName: r.appointment.service.nameEn,
    doctorName: r.appointment.doctor?.name ?? null,
    startAtLocal: formatted,
    language: lang,
  });

  try {
    const sent = await sendWhatsAppText({
      clinic: r.clinic,
      to: r.appointment.client.phone,
      text,
    });
    await prisma.reminder.update({
      where: { id: r.id },
      data: { status: "sent", sentAt: new Date(), attempts: { increment: 1 } },
    });
    logger.info(
      { reminderId: r.id, appointmentId: r.appointmentId, messageId: sent.messageId },
      "reminder.sent",
    );
  } catch (err) {
    const attempts = r.attempts + 1;
    const failed = attempts >= 3;
    await prisma.reminder.update({
      where: { id: r.id },
      data: {
        status: failed ? "failed" : "pending",
        attempts,
        errorMessage: String(err).slice(0, 500),
      },
    });
    logger.warn(
      { reminderId: r.id, attempts, failed },
      "reminder.send.failed",
    );
  }
}
