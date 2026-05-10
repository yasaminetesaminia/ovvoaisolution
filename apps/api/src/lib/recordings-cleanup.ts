/**
 * Daily recordings retention sweep.
 *
 * Privacy + compliance: clinic calls contain PHI-adjacent data (caller
 * names, treatments mentioned, sometimes mobile numbers). Keeping the
 * audio indefinitely is a liability with no operational upside — the
 * dashboard's transcript + outcome already covers QA needs after a
 * few days.
 *
 * What this does once every 24h:
 *   1. Find calls with recordingUrl set whose startedAt is older than
 *      RETENTION_DAYS (default 30).
 *   2. Best-effort DELETE on Vapi to remove the audio from their storage.
 *   3. NULL out our recordingUrl + flag with a recordingDeletedAt
 *      audit event so the dashboard shows "recording purged" instead
 *      of a broken player.
 *
 * Idempotent: a re-run skips rows whose recordingUrl is already null.
 *
 * Why in-process and not a separate cron service: same reasoning as
 * the reminders runner — the API process stays up on Railway, one less
 * moving part during the 7-day build.
 */

import { prisma } from "@lavora/db";

import { logger } from "./logger.js";

const RETENTION_DAYS = Number(process.env.CALL_RECORDING_RETENTION_DAYS ?? "30");
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // every 24h
// First sweep happens 5 minutes after boot so a Railway redeploy
// doesn't kick a heavy purge before the API is settled.
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

let started = false;

export function startRecordingsCleanup(): void {
  if (started) return;
  started = true;
  logger.info({ retentionDays: RETENTION_DAYS }, "recordings.cleanup.started");
  setTimeout(() => void sweep(), FIRST_RUN_DELAY_MS);
  setInterval(() => void sweep(), RUN_INTERVAL_MS);
}

async function sweep(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let due;
  try {
    due = await prisma.call.findMany({
      where: {
        startedAt: { lt: cutoff },
        recordingUrl: { not: null },
      },
      select: { id: true, clinicId: true, vapiCallId: true, recordingUrl: true },
      take: 200,
    });
  } catch (err) {
    logger.error({ err }, "recordings.cleanup.fetch_failed");
    return;
  }

  if (due.length === 0) {
    logger.info("recordings.cleanup.nothing_to_purge");
    return;
  }

  logger.info({ count: due.length, cutoff }, "recordings.cleanup.batch");

  for (const call of due) {
    try {
      if (call.vapiCallId) await deleteOnVapi(call.vapiCallId);
    } catch (err) {
      // Vapi-side delete failures shouldn't block our DB purge — the
      // clinic's privacy ask is "the URL we expose is gone", not
      // "every byte everywhere is gone".
      logger.warn({ err, callId: call.id }, "recordings.cleanup.vapi_delete_failed");
    }
    try {
      await prisma.call.update({
        where: { id: call.id },
        data: { recordingUrl: null },
      });
      await prisma.auditEvent.create({
        data: {
          clinicId: call.clinicId,
          type: "call.recording.purged",
          actor: "system",
          payload: { callId: call.id, vapiCallId: call.vapiCallId },
        },
      });
    } catch (err) {
      logger.error({ err, callId: call.id }, "recordings.cleanup.update_failed");
    }
  }
}

async function deleteOnVapi(vapiCallId: string): Promise<void> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return; // No key → can't reach Vapi; let the DB purge proceed anyway.

  const res = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  // 404 means Vapi already lost the row — fine.
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Vapi DELETE /call/${vapiCallId} → ${res.status}: ${body.slice(0, 200)}`);
  }
}
