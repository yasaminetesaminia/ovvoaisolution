/**
 * Vapi tool-webhook endpoints.
 *
 * Vapi calls these during a live phone call when its agent decides to
 * invoke a tool. Each route:
 *   1. Authenticates via vapiAuth middleware (sets clinicId on the ctx).
 *   2. Pulls the tool's arguments out of the Vapi payload.
 *   3. Runs the underlying domain logic in @lavora/core.
 *   4. Returns a `results` array in the shape Vapi expects:
 *        { results: [{ toolCallId, result: <stringified or object> }] }
 *
 * Tool naming matches the legacy bot so prompts don't have to change:
 *   check_available_slots
 *   book_appointment
 *   cancel_appointment
 *   get_my_appointment
 *   list_services
 */

import { Hono } from "hono";
import { z } from "zod";

import {
  createBooking,
  cancelUpcoming,
  detectLanguage,
  findAvailableSlots,
  getUpcomingForClient,
  SlotNoLongerAvailable,
} from "@lavora/core";
import { prisma } from "@lavora/db";

import { logger } from "../lib/logger.js";
import { vapiAuth } from "../middleware/vapi-auth.js";

export const toolRoutes = new Hono();

toolRoutes.use("*", vapiAuth);

// ---- Helpers ----

interface VapiToolCall {
  id: string;
  function?: { name: string; arguments: Record<string, unknown> };
}

function extractToolCalls(body: any): VapiToolCall[] {
  return body?.message?.toolCalls ?? body?.message?.tool_calls ?? [];
}

function vapiResponse(toolCallId: string, result: unknown) {
  return {
    results: [
      {
        toolCallId,
        result: typeof result === "string" ? result : JSON.stringify(result),
      },
    ],
  };
}

// ---- Single dispatcher endpoint ----
//
// Vapi can be configured to point ALL function tools at the same URL —
// the function name comes through in the payload. That's what we do here:
// one URL, dispatch by name. Cleaner than 5 separate endpoints with
// duplicate auth + payload extraction.

toolRoutes.post("/dispatch", async (c) => {
  const clinicId = c.get("clinicId");
  const body: any = (c as any).get("body");
  const toolCalls = extractToolCalls(body);

  if (toolCalls.length === 0) {
    return c.json({ error: "no_tool_calls" }, 400);
  }

  const callerPhone: string = body?.message?.call?.customer?.number ?? "";

  // Vapi can batch tool calls; handle them all and return results array.
  const results = await Promise.all(
    toolCalls.map(async (tc) => {
      const name = tc.function?.name;
      const args = tc.function?.arguments ?? {};
      try {
        const out = await dispatch(name ?? "", args, { clinicId, callerPhone, toolCallId: tc.id });
        return { toolCallId: tc.id, result: typeof out === "string" ? out : JSON.stringify(out) };
      } catch (err) {
        logger.error({ err, name, args }, "tool dispatch failed");
        return {
          toolCallId: tc.id,
          result: JSON.stringify({ success: false, error: (err as Error).message }),
        };
      }
    }),
  );

  return c.json({ results });
});

// ---- Tool implementations ----

interface ToolCtx {
  clinicId: string;
  callerPhone: string;
  toolCallId: string;
}

async function dispatch(name: string, args: any, ctx: ToolCtx): Promise<unknown> {
  switch (name) {
    case "check_available_slots":
      return checkAvailableSlots(args, ctx);
    case "book_appointment":
      return bookAppointment(args, ctx);
    case "cancel_appointment":
      return cancelAppointment(args, ctx);
    case "get_my_appointment":
      return getMyAppointment(args, ctx);
    case "list_services":
      return listServices(ctx);
    default:
      return { success: false, error: `unknown_tool: ${name}` };
  }
}

const CheckSlotsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  service_key: z.string(),
  doctor_id: z.string().optional(),
});

async function checkAvailableSlots(args: unknown, ctx: ToolCtx) {
  const parsed = CheckSlotsSchema.parse(args);
  return findAvailableSlots({
    clinicId: ctx.clinicId,
    serviceKey: parsed.service_key,
    dateYmd: parsed.date,
    doctorId: parsed.doctor_id,
  });
}

const BookSchema = z.object({
  client_name: z.string().min(1),
  service_key: z.string(),
  doctor_id: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  language: z.enum(["en", "ar"]).optional(),
  notes: z.string().optional(),
});

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
      source: "voice",
      notes: parsed.notes,
      idempotencyKey: ctx.toolCallId,
    });
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

async function cancelAppointment(_args: unknown, ctx: ToolCtx) {
  if (!ctx.callerPhone) return { success: false, error: "missing_caller_number" };
  const cancelled = await cancelUpcoming({
    clinicId: ctx.clinicId,
    clientPhone: ctx.callerPhone,
  });
  if (!cancelled) {
    return { success: false, message: "No upcoming appointment found for this number." };
  }
  return { success: true, appointment_id: cancelled.id };
}

async function getMyAppointment(_args: unknown, ctx: ToolCtx) {
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
