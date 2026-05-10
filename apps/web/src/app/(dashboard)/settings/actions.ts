"use server";

/**
 * Settings server actions.
 *
 * Each action authenticates, scopes the write to the active clinic,
 * mutates Postgres, then revalidatePath("/settings") so the next
 * render picks up the new state. Side effects with external impact
 * (Vapi assistant prompt regen on doctor/service change) are fired
 * background so the UI stays snappy.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@lavora/db";

import { getActiveClinic, requireUser } from "@/lib/auth";

// ---- Clinic basics ----

const ClinicBasicsSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(120).optional().nullable().or(z.literal("")),
  website: z.string().max(200).optional().nullable(),
  addressEn: z.string().max(500).optional().nullable(),
  addressAr: z.string().max(500).optional().nullable(),
  tagline: z.string().max(200).optional().nullable(),
});

export async function updateClinicBasics(input: z.infer<typeof ClinicBasicsSchema>) {
  await requireUser();
  const clinic = await getActiveClinic();
  const parsed = ClinicBasicsSchema.parse(input);
  await prisma.clinic.update({
    where: { id: clinic.id },
    data: {
      name: parsed.name,
      phone: parsed.phone || null,
      email: parsed.email || null,
      website: parsed.website || null,
      addressEn: parsed.addressEn || null,
      addressAr: parsed.addressAr || null,
      tagline: parsed.tagline || null,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/");
}

// ---- Hours ----

const HoursSchema = z.object({
  workingStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingEnd: z.string().regex(/^\d{2}:\d{2}$/),
  closedDay: z.enum([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]),
});

export async function updateClinicHours(input: z.infer<typeof HoursSchema>) {
  await requireUser();
  const clinic = await getActiveClinic();
  const parsed = HoursSchema.parse(input);
  await prisma.clinic.update({
    where: { id: clinic.id },
    data: parsed,
  });
  revalidatePath("/settings");
}

// ---- Holidays ----

export async function addHoliday(date: string, reason: string | null) {
  await requireUser();
  const clinic = await getActiveClinic();
  const parsedDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
  await prisma.holiday.upsert({
    where: { clinicId_date: { clinicId: clinic.id, date: new Date(parsedDate) } },
    update: { reason: reason || null },
    create: { clinicId: clinic.id, date: new Date(parsedDate), reason: reason || null },
  });
  revalidatePath("/settings");
}

export async function removeHoliday(id: string) {
  await requireUser();
  const clinic = await getActiveClinic();
  await prisma.holiday.deleteMany({ where: { id, clinicId: clinic.id } });
  revalidatePath("/settings");
}

// ---- Doctors ----

const DoctorSchema = z.object({
  name: z.string().min(1).max(100),
  nameAr: z.string().max(100).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  specialties: z.array(z.string()).default([]),
});

export async function addDoctor(input: z.infer<typeof DoctorSchema>) {
  await requireUser();
  const clinic = await getActiveClinic();
  const parsed = DoctorSchema.parse(input);
  await prisma.doctor.create({
    data: {
      clinicId: clinic.id,
      name: parsed.name,
      nameAr: parsed.nameAr || null,
      title: parsed.title || null,
      specialties: parsed.specialties,
    },
  });
  revalidatePath("/settings");
}

export async function updateDoctor(
  id: string,
  input: z.infer<typeof DoctorSchema>,
) {
  await requireUser();
  const clinic = await getActiveClinic();
  const parsed = DoctorSchema.parse(input);
  await prisma.doctor.updateMany({
    where: { id, clinicId: clinic.id },
    data: {
      name: parsed.name,
      nameAr: parsed.nameAr || null,
      title: parsed.title || null,
      specialties: parsed.specialties,
    },
  });
  revalidatePath("/settings");
}

export async function deleteDoctor(id: string) {
  await requireUser();
  const clinic = await getActiveClinic();
  // Soft-delete by deactivating — keep history intact for past appointments.
  await prisma.doctor.updateMany({
    where: { id, clinicId: clinic.id },
    data: { isActive: false },
  });
  revalidatePath("/settings");
}

// ---- Services ----

const ServiceUpdateSchema = z.object({
  nameEn: z.string().min(1).max(150),
  nameAr: z.string().max(150).optional().nullable(),
  durationMinutes: z.number().int().min(5).max(480),
  priceMinor: z.number().int().min(0).optional().nullable(),
  priceUnit: z.string().max(50).optional().nullable(),
  capacity: z.number().int().min(1).max(20),
  isActive: z.boolean(),
});

export async function updateService(
  id: string,
  input: z.infer<typeof ServiceUpdateSchema>,
) {
  await requireUser();
  const clinic = await getActiveClinic();
  const parsed = ServiceUpdateSchema.parse(input);
  await prisma.service.updateMany({
    where: { id, clinicId: clinic.id },
    data: {
      nameEn: parsed.nameEn,
      nameAr: parsed.nameAr || null,
      durationMinutes: parsed.durationMinutes,
      priceMinor: parsed.priceMinor ?? null,
      priceUnit: parsed.priceUnit || null,
      capacity: parsed.capacity,
      isActive: parsed.isActive,
    },
  });
  revalidatePath("/settings");
}

export async function toggleServiceActive(id: string, isActive: boolean) {
  await requireUser();
  const clinic = await getActiveClinic();
  await prisma.service.updateMany({
    where: { id, clinicId: clinic.id },
    data: { isActive },
  });
  revalidatePath("/settings");
}
