"use server";

/**
 * Appointment server actions invoked from the dashboard UI.
 *
 * Mirrors the same logic the voice agent uses (cancellation flips
 * status + cleans up the calendar event + cancels pending reminders),
 * but proxies via a fetch to the API so we have ONE source of truth
 * for the booking lifecycle. For now we hit the DB + post-booking
 * helpers directly — the API doesn't yet expose an admin cancel
 * endpoint. We can move this to API later without changing the UI.
 */

import { revalidatePath } from "next/cache";

import { cancelUpcoming } from "@lavora/core";
import { prisma } from "@lavora/db";

import { requireUser, getActiveClinic } from "@/lib/auth";

export async function cancelAppointment(appointmentId: string): Promise<void> {
  await requireUser();
  const clinic = await getActiveClinic();

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: clinic.id },
    include: { client: true },
  });
  if (!appt) throw new Error("Appointment not found.");

  await cancelUpcoming({
    clinicId: clinic.id,
    clientPhone: appt.client.phone,
    appointmentId: appt.id,
  });

  revalidatePath("/appointments");
}

export async function markCompleted(appointmentId: string): Promise<void> {
  await requireUser();
  const clinic = await getActiveClinic();
  await prisma.appointment.update({
    where: { id: appointmentId, clinicId: clinic.id },
    data: { status: "completed" },
  });
  revalidatePath("/appointments");
}

export async function markNoShow(appointmentId: string): Promise<void> {
  await requireUser();
  const clinic = await getActiveClinic();
  await prisma.appointment.update({
    where: { id: appointmentId, clinicId: clinic.id },
    data: { status: "no_show" },
  });
  revalidatePath("/appointments");
}
