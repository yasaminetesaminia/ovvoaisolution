/**
 * Vapi server-event webhooks (separate from the per-tool /v1/tools
 * dispatcher). Vapi posts here for lifecycle events:
 *
 *   - status-update      (in-progress / forwarding / ended)
 *   - end-of-call-report (final transcript, recording, cost, summary)
 *   - speech-update / transcript / function-call (we ignore these here —
 *     function calls land at /v1/tools instead)
 *
 * We persist end-of-call data to the `calls` table so the dashboard
 * can render historical activity. Idempotent on vapiCallId — Vapi
 * may retry on a 5xx and we don't want duplicates.
 */

import { Hono } from "hono";

import { prisma } from "@lavora/db";

import { logger } from "../lib/logger.js";

export const webhookRoutes = new Hono();

webhookRoutes.post("/vapi", async (c) => {
  const raw = await c.req.text();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const msg = parsed?.message ?? parsed;
  const type: string = msg?.type ?? "unknown";
  const assistantId: string | undefined =
    msg?.assistant?.id ?? msg?.call?.assistantId;

  // Resolve clinic by assistant id. Unknown assistant → 200 so Vapi
  // doesn't retry forever; just log and ignore.
  let clinicId: string | undefined;
  if (assistantId) {
    const clinic = await prisma.clinic.findFirst({
      where: { vapiAssistantId: assistantId },
      select: { id: true },
    });
    clinicId = clinic?.id;
  }
  if (!clinicId) {
    logger.warn({ type, assistantId }, "vapi.webhook.unknown_assistant");
    return c.json({ ok: true });
  }

  switch (type) {
    case "end-of-call-report":
      await handleEndOfCall(clinicId, msg);
      break;
    case "status-update":
      await handleStatusUpdate(clinicId, msg);
      break;
    default:
      // Quietly ack everything else — Vapi sends a stream of
      // transcript / speech-update events we don't need here.
      break;
  }

  return c.json({ ok: true });
});

// ---- handlers ----

async function handleEndOfCall(clinicId: string, msg: any): Promise<void> {
  const call = msg?.call ?? {};
  const vapiCallId: string | undefined = call?.id;
  if (!vapiCallId) {
    logger.warn("vapi.eoc.missing_call_id");
    return;
  }

  const fromNumber: string =
    call?.customer?.number ?? call?.from ?? msg?.customer?.number ?? "unknown";
  const toNumber: string | undefined = call?.phoneNumber?.number ?? call?.to;
  const startedAt = parseDate(msg?.startedAt ?? call?.startedAt) ?? new Date();
  const endedAt = parseDate(msg?.endedAt ?? call?.endedAt) ?? new Date();
  const durationSec = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
  );
  const cost: number | null =
    typeof msg?.cost === "number" ? msg.cost : typeof msg?.costBreakdown?.total === "number" ? msg.costBreakdown.total : null;
  const recordingUrl: string | undefined =
    msg?.recordingUrl ?? msg?.stereoRecordingUrl ?? call?.recordingUrl;
  const transcript = msg?.artifact ?? {
    transcript: msg?.transcript,
    messages: msg?.messages,
    summary: msg?.summary,
    successEvaluation: msg?.analysis?.successEvaluation,
  };
  const outcome = inferOutcome(msg);

  // Try to link to a known client by phone number.
  let clientId: string | null = null;
  if (fromNumber && fromNumber !== "unknown") {
    const client = await prisma.client.findUnique({
      where: { clinicId_phone: { clinicId, phone: fromNumber } },
      select: { id: true },
    });
    clientId = client?.id ?? null;
  }

  await prisma.call.upsert({
    where: { vapiCallId },
    create: {
      clinicId,
      vapiCallId,
      clientId,
      fromNumber,
      toNumber: toNumber ?? null,
      startedAt,
      endedAt,
      durationSec,
      transcript,
      recordingUrl: recordingUrl ?? null,
      outcome,
      costUsd: cost,
    },
    update: {
      // Only fields that can legitimately change on a re-delivery. We
      // never overwrite the original startedAt / fromNumber.
      endedAt,
      durationSec,
      transcript,
      recordingUrl: recordingUrl ?? undefined,
      outcome,
      costUsd: cost,
      clientId: clientId ?? undefined,
    },
  });

  logger.info(
    { vapiCallId, durationSec, outcome, cost },
    "vapi.call.persisted",
  );
}

async function handleStatusUpdate(clinicId: string, msg: any): Promise<void> {
  const call = msg?.call ?? {};
  const vapiCallId: string | undefined = call?.id;
  if (!vapiCallId) return;

  const status: string | undefined = msg?.status;
  // Insert a stub row at call start so the dashboard shows in-progress
  // calls in real time. Subsequent end-of-call upserts fill it in.
  if (status === "in-progress" || status === "ringing") {
    const fromNumber: string =
      call?.customer?.number ?? call?.from ?? "unknown";
    await prisma.call.upsert({
      where: { vapiCallId },
      create: {
        clinicId,
        vapiCallId,
        fromNumber,
        startedAt: new Date(),
      },
      update: {},
    });
  }
}

// ---- helpers ----

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function inferOutcome(msg: any): string | null {
  const summary = (msg?.summary ?? "").toLowerCase();
  const eval_ = (msg?.analysis?.successEvaluation ?? "").toString().toLowerCase();
  const reason = (msg?.endedReason ?? "").toLowerCase();

  if (reason.includes("voicemail")) return "voicemail";
  if (summary.includes("book") || eval_.includes("success") && summary.includes("book")) return "booked";
  if (summary.includes("cancel")) return "cancelled";
  if (eval_.includes("partial")) return "partial";
  if (eval_.includes("failure") || reason.includes("error")) return "failed";
  if (summary.includes("info") || summary.includes("inquiry")) return "info";
  return null;
}
