/**
 * Booking creation, cancellation, lookup — all the writes that any
 * channel (voice, WhatsApp, manual UI) eventually funnels into.
 *
 * Idempotency: every booking accepts an `idempotencyKey`. Re-invoking
 * the same call with the same key returns the existing appointment
 * instead of creating a duplicate — critical when Vapi retries a tool
 * webhook on a 5xx blip. We use a unique index on the column so the
 * DB itself enforces it.
 *
 * Capacity: re-checked under a Postgres advisory lock per (clinic,
 * department) so two parallel callers booking the same slot can't
 * both squeak through.
 */

import { prisma, type AppointmentStatus, type Channel } from "@lavora/db";
import { addMin, localTimeToUtc, rangeOverlaps } from "./time.js";

export class SlotNoLongerAvailable extends Error {
  constructor() {
    super("Requested slot is fully booked.");
    this.name = "SlotNoLongerAvailable";
  }
}

export class ClientLookupError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ClientLookupError";
  }
}

export interface CreateBookingInput {
  clinicId: string;
  /** E.164 phone (we'll upsert the client by phone). */
  clientPhone: string;
  clientName: string;
  clientLanguage?: "en" | "ar";
  serviceKey: string;
  doctorId?: string | null;
  /** YYYY-MM-DD in clinic-local time */
  date: string;
  /** HH:MM in clinic-local time */
  time: string;
  source: Channel;
  notes?: string;
  packageId?: string | null;
  /** Vapi tool calls retry — pass a stable key (e.g. tool_call_id) to
   *  guarantee at-most-once booking. */
  idempotencyKey?: string;
}

export interface BookingResult {
  appointmentId: string;
  startAt: Date;
  endAt: Date;
  serviceKey: string;
  doctorId: string | null;
  isNew: boolean; // false → idempotent re-hit
}

export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
  // Idempotency short-circuit — done before any other work.
  if (input.idempotencyKey) {
    const existing = await prisma.appointment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return {
        appointmentId: existing.id,
        startAt: existing.startAt,
        endAt: existing.endAt,
        serviceKey: input.serviceKey,
        doctorId: existing.doctorId,
        isNew: false,
      };
    }
  }

  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: input.clinicId },
  });
  const service = await prisma.service.findUniqueOrThrow({
    where: { clinicId_key: { clinicId: input.clinicId, key: input.serviceKey } },
  });

  const startAt = localTimeToUtc(input.date, input.time, clinic.timezone);
  const endAt = addMin(startAt, service.durationMinutes);

  // Upsert client by (clinicId, phone)
  const client = await prisma.client.upsert({
    where: { clinicId_phone: { clinicId: input.clinicId, phone: input.clientPhone } },
    update: { name: input.clientName, language: input.clientLanguage ?? undefined },
    create: {
      clinicId: input.clinicId,
      phone: input.clientPhone,
      name: input.clientName,
      language: input.clientLanguage ?? "en",
      source: input.source,
    },
  });

  // Recheck capacity in a transaction with an advisory lock so parallel
  // bookings for the same bucket serialise.
  const created = await prisma.$transaction(async (tx) => {
    // Hash the bucket → bigint for pg_advisory_xact_lock. Postgres takes
    // two ints; we split a 64-bit hash. Lock key only needs to be stable
    // and bucket-specific, not cryptographic.
    const lockKey = bucketLockKey(input.clinicId, service.department, input.doctorId ?? null);
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey.hi}, ${lockKey.lo})`);

    const competing = await tx.appointment.findMany({
      where: {
        clinicId: input.clinicId,
        status: "scheduled",
        startAt: { gte: addMin(startAt, -service.durationMinutes), lte: endAt },
        ...(input.doctorId ? { doctorId: input.doctorId } : {}),
        service: { department: service.department },
      },
    });
    const overlap = competing.filter((a) =>
      rangeOverlaps(startAt, endAt, a.startAt, a.endAt),
    );
    if (overlap.length >= service.capacity) {
      throw new SlotNoLongerAvailable();
    }

    return tx.appointment.create({
      data: {
        clinicId: input.clinicId,
        clientId: client.id,
        serviceId: service.id,
        doctorId: input.doctorId ?? null,
        startAt,
        endAt,
        source: input.source,
        notes: input.notes ?? null,
        packageId: input.packageId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  });

  // Log + schedule reminder. (Reminder fanout lives in workers; this
  // just enqueues the row.)
  await prisma.auditEvent.create({
    data: {
      clinicId: input.clinicId,
      type: "booking.created",
      actor: input.source,
      payload: {
        appointmentId: created.id,
        serviceKey: input.serviceKey,
        startAt: created.startAt,
      },
    },
  });

  await prisma.reminder.create({
    data: {
      clinicId: input.clinicId,
      appointmentId: created.id,
      // 24h before
      scheduledFor: new Date(created.startAt.getTime() - 24 * 60 * 60 * 1000),
      channel: "whatsapp",
    },
  });

  return {
    appointmentId: created.id,
    startAt: created.startAt,
    endAt: created.endAt,
    serviceKey: input.serviceKey,
    doctorId: created.doctorId,
    isNew: true,
  };
}

export async function cancelUpcoming(opts: {
  clinicId: string;
  clientPhone: string;
  appointmentId?: string;
}) {
  const where = opts.appointmentId
    ? { id: opts.appointmentId, clinicId: opts.clinicId }
    : {
        clinicId: opts.clinicId,
        client: { phone: opts.clientPhone },
        status: "scheduled" as AppointmentStatus,
        startAt: { gte: new Date() },
      };

  const target = await prisma.appointment.findFirst({
    where,
    orderBy: { startAt: "asc" },
    include: { service: true, doctor: true },
  });
  if (!target) return null;

  const updated = await prisma.appointment.update({
    where: { id: target.id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });

  // Cancel any pending reminders.
  await prisma.reminder.updateMany({
    where: { appointmentId: target.id, status: "pending" },
    data: { status: "cancelled" },
  });

  await prisma.auditEvent.create({
    data: {
      clinicId: opts.clinicId,
      type: "booking.cancelled",
      payload: { appointmentId: target.id },
    },
  });

  return updated;
}

export async function getUpcomingForClient(opts: {
  clinicId: string;
  clientPhone: string;
}) {
  return prisma.appointment.findFirst({
    where: {
      clinicId: opts.clinicId,
      status: "scheduled",
      startAt: { gte: new Date() },
      client: { phone: opts.clientPhone },
    },
    orderBy: { startAt: "asc" },
    include: { service: true, doctor: true, client: true },
  });
}

// --- internals ---

function bucketLockKey(clinicId: string, dept: string, doctorId: string | null) {
  // Cheap deterministic hash → two 32-bit ints for pg_advisory_xact_lock.
  const s = `${clinicId}:${dept}:${doctorId ?? ""}`;
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < s.length; i++) {
    hi = (hi * 31 + s.charCodeAt(i)) | 0;
    lo = (lo * 17 + s.charCodeAt(i) * 13) | 0;
  }
  return { hi, lo };
}
