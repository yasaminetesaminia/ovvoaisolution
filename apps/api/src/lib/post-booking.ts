/**
 * Stuff that happens *after* a booking is created in Postgres:
 *   - mirror to Google Calendar (so the receptionist sees it in their app)
 *   - schedule the 24-hour WhatsApp reminder
 *
 * Errors here are LOGGED but DO NOT fail the booking — the appointment
 * is already saved in the source-of-truth Postgres row. A calendar
 * mirror failure shouldn't make us lose a booking.
 */

import { createCalendarEvent, cancelCalendarEvent } from "@lavora/calendar";
import { prisma } from "@lavora/db";

import { logger } from "./logger.js";

export async function afterBookingCreated(appointmentId: string): Promise<void> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { clinic: true, service: true, doctor: true, client: true },
  });
  if (!appt) return;

  // 1. Calendar mirror
  try {
    const eventId = await createCalendarEvent({
      clinic: appt.clinic,
      appointment: appt,
      service: appt.service,
      doctor: appt.doctor,
      clientName: appt.client.name,
      clientPhone: appt.client.phone,
    });
    if (eventId) {
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { gcalEventId: eventId },
      });
      logger.info({ appointmentId, eventId }, "calendar.event.created");
    }
  } catch (err) {
    logger.error({ err, appointmentId }, "calendar.event.failed");
    await prisma.auditEvent.create({
      data: {
        clinicId: appt.clinicId,
        type: "calendar.sync.failed",
        actor: "system",
        payload: { appointmentId, error: String(err).slice(0, 500) },
      },
    });
  }

  // 2. Reminder is already scheduled by createBooking() in @lavora/core,
  //    but we double-check the row exists. If it doesn't (race), upsert.
  await prisma.reminder.upsert({
    where: {
      appointmentId_channel: { appointmentId: appt.id, channel: "whatsapp" },
    },
    create: {
      clinicId: appt.clinicId,
      appointmentId: appt.id,
      scheduledFor: new Date(appt.startAt.getTime() - 24 * 60 * 60 * 1000),
      channel: "whatsapp",
    },
    update: {},
  });
}

export async function afterBookingCancelled(appointmentId: string): Promise<void> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { clinic: true },
  });
  if (!appt) return;

  if (appt.gcalEventId) {
    try {
      await cancelCalendarEvent({ clinic: appt.clinic, gcalEventId: appt.gcalEventId });
      logger.info({ appointmentId }, "calendar.event.cancelled");
    } catch (err) {
      logger.error({ err, appointmentId }, "calendar.cancel.failed");
    }
  }

  // Cancel any pending reminders.
  await prisma.reminder.updateMany({
    where: { appointmentId, status: "pending" },
    data: { status: "cancelled" },
  });
}
