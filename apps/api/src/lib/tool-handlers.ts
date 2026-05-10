/**
 * Single source of truth for the agent's tools, callable from both
 * channels:
 *   - Voice (Vapi): wrapped by /v1/tools/dispatch which formats to
 *     Vapi's results-array shape.
 *   - Chat (WhatsApp): called directly from the in-process Claude
 *     tool-use loop in whatsapp-agent.ts.
 *
 * Each handler is a pure async (clinic + client + args) → JSON-able
 * result. No HTTP, no Vapi-specific shapes — that wrapping happens
 * one layer up.
 */

import { z } from "zod";

import {
  cancelUpcoming,
  createBooking,
  detectLanguage,
  findAvailableSlots,
  getUpcomingForClient,
  SlotNoLongerAvailable,
} from "@lavora/core";
import { prisma, type Channel } from "@lavora/db";

import { logger } from "./logger.js";
import { afterBookingCancelled, afterBookingCreated } from "./post-booking.js";

export interface ToolCtx {
  clinicId: string;
  callerPhone: string;
  /** Stable id used for booking idempotency — Vapi tool-call id, or a
   *  WhatsApp message id. Re-running the same handler with the same
   *  key returns the same appointment (no doubles on retry). */
  idempotencyKey?: string;
  channel: Channel;
}

export type ToolResult = unknown;

const CheckSlotsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  service_key: z.string(),
  doctor_id: z.string().optional(),
});

const BookSchema = z.object({
  client_name: z.string().min(1),
  service_key: z.string(),
  doctor_id: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  language: z.enum(["en", "ar"]).optional(),
  notes: z.string().optional(),
});

export async function dispatchTool(
  name: string,
  args: unknown,
  ctx: ToolCtx,
): Promise<ToolResult> {
  switch (name) {
    case "check_available_slots":
      return checkAvailableSlots(args, ctx);
    case "book_appointment":
      return bookAppointment(args, ctx);
    case "cancel_appointment":
      return cancelAppointment(ctx);
    case "get_my_appointment":
      return getMyAppointment(ctx);
    case "list_services":
      return listServices(ctx);
    default:
      return { success: false, error: `unknown_tool: ${name}` };
  }
}

async function checkAvailableSlots(args: unknown, ctx: ToolCtx) {
  const parsed = CheckSlotsSchema.parse(args);
  return findAvailableSlots({
    clinicId: ctx.clinicId,
    serviceKey: parsed.service_key,
    dateYmd: parsed.date,
    doctorId: parsed.doctor_id,
  });
}

async function bookAppointment(args: unknown, ctx: ToolCtx) {
  const parsed = BookSchema.parse(args);
  if (!ctx.callerPhone) {
    return { success: false, error: "missing_caller_number" };
  }
  try {
    const result = await createBooking({
      clinicId: ctx.clinicId,
      clientPhone: ctx.callerPhone,
      clientName: parsed.client_name,
      clientLanguage: parsed.language ?? detectLanguage(parsed.client_name),
      serviceKey: parsed.service_key,
      doctorId: parsed.doctor_id ?? undefined,
      date: parsed.date,
      time: parsed.time,
      source: ctx.channel,
      notes: parsed.notes,
      idempotencyKey: ctx.idempotencyKey,
    });
    if (result.isNew) {
      void afterBookingCreated(result.appointmentId).catch((err) =>
        logger.error({ err, appointmentId: result.appointmentId }, "post-booking failed"),
      );
    }
    return {
      success: true,
      appointment_id: result.appointmentId,
      start_at: result.startAt.toISOString(),
      already_booked: !result.isNew,
    };
  } catch (err) {
    if (err instanceof SlotNoLongerAvailable) {
      return {
        success: false,
        slot_taken: true,
        message:
          "That slot was just taken — ask the caller to pick another time and run check_available_slots again.",
      };
    }
    throw err;
  }
}

async function cancelAppointment(ctx: ToolCtx) {
  if (!ctx.callerPhone) return { success: false, error: "missing_caller_number" };
  const cancelled = await cancelUpcoming({
    clinicId: ctx.clinicId,
    clientPhone: ctx.callerPhone,
  });
  if (!cancelled) {
    return { success: false, message: "No upcoming appointment found for this number." };
  }
  void afterBookingCancelled(cancelled.id).catch((err) =>
    logger.error({ err, appointmentId: cancelled.id }, "post-cancel failed"),
  );
  return { success: true, appointment_id: cancelled.id };
}

async function getMyAppointment(ctx: ToolCtx) {
  if (!ctx.callerPhone) return { success: false, error: "missing_caller_number" };
  const appt = await getUpcomingForClient({
    clinicId: ctx.clinicId,
    clientPhone: ctx.callerPhone,
  });
  if (!appt) return { success: false, message: "No upcoming appointment found." };
  return {
    success: true,
    appointment_id: appt.id,
    start_at: appt.startAt.toISOString(),
    service: appt.service.nameEn,
    doctor: appt.doctor?.name ?? null,
  };
}

async function listServices(ctx: ToolCtx) {
  const svcs = await prisma.service.findMany({
    where: { clinicId: ctx.clinicId, isActive: true },
    orderBy: [{ department: "asc" }, { nameEn: "asc" }],
    select: {
      key: true,
      department: true,
      nameEn: true,
      nameAr: true,
      durationMinutes: true,
      priceMinor: true,
      priceUnit: true,
    },
  });
  return {
    services: svcs.map((s) => ({
      key: s.key,
      department: s.department,
      name_en: s.nameEn,
      name_ar: s.nameAr,
      duration_minutes: s.durationMinutes,
      price_omr: s.priceMinor ? s.priceMinor / 1000 : null,
      price_unit: s.priceUnit,
    })),
  };
}

/** Tool schemas in Anthropic format — used by the chat agent.
 *  (Vapi format is generated separately in @lavora/voice.) */
export const ANTHROPIC_TOOLS = [
  {
    name: "check_available_slots",
    description:
      "Check available appointment slots for a service on a date. Returns slots grouped morning/afternoon/evening. Call BEFORE mentioning any specific time to the caller.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD in clinic-local time." },
        service_key: { type: "string", description: "Service identifier, e.g. 'botox'." },
        doctor_id: {
          type: "string",
          description:
            "Optional doctor ID for multi-doctor departments (dermatology, aesthetics).",
        },
      },
      required: ["date", "service_key"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment. ONLY call after check_available_slots returned the time as available. Returns success/failure + appointment_id.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Caller's full name." },
        service_key: { type: "string" },
        doctor_id: {
          type: "string",
          description:
            "Doctor ID for multi-doctor departments. Leave empty for slimming and laser_hair_removal.",
        },
        date: { type: "string", description: "YYYY-MM-DD." },
        time: { type: "string", description: "HH:MM (24h)." },
        language: {
          type: "string",
          enum: ["en", "ar"],
          description: "Conversation language (used for the WhatsApp reminder).",
        },
        notes: { type: "string" },
      },
      required: ["client_name", "service_key", "date", "time", "language"],
    },
  },
  {
    name: "get_my_appointment",
    description:
      "Look up the caller's nearest upcoming appointment by phone number. Use BEFORE cancel_appointment.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel the caller's nearest upcoming appointment. Always call get_my_appointment FIRST and confirm before invoking.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_services",
    description:
      "Return the clinic's full service catalog. Only when the caller asks 'what do you offer'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
] as const;
