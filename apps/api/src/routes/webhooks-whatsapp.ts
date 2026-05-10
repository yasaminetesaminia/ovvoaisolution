/**
 * Meta WhatsApp Business Cloud API webhook.
 *
 * Two routes share the same path:
 *   GET  /v1/webhooks/whatsapp — Meta one-time verification handshake.
 *   POST /v1/webhooks/whatsapp — incoming message + status callbacks.
 *
 * On a real message we ack 200 immediately and process in the
 * background — Meta retries any webhook that doesn't 200 within ~5s
 * and we don't want a slow Anthropic round-trip to trigger duplicates.
 *
 * Idempotency: the bookkeeping uses message_id so even if Meta does
 * retry, we won't reply twice and we won't double-book. Stale messages
 * (>5 min old) get dropped — those are usually retries of stuff we
 * already processed.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { Hono } from "hono";

import { sendWhatsAppText } from "@lavora/chat";
import { prisma } from "@lavora/db";

import { logger } from "../lib/logger.js";
import { runChat } from "../lib/whatsapp-agent.js";

export const whatsappRoutes = new Hono();

// Recently-handled message ids → skip on retry. 1000-entry rolling LRU.
const HANDLED: Map<string, number> = new Map();
const MAX_HANDLED = 1000;
const STALE_AGE_MS = 5 * 60 * 1000;

function rememberHandled(id: string): boolean {
  if (HANDLED.has(id)) return true;
  HANDLED.set(id, Date.now());
  if (HANDLED.size > MAX_HANDLED) {
    // Drop the oldest entry — Map preserves insertion order.
    const first = HANDLED.keys().next().value;
    if (first) HANDLED.delete(first);
  }
  return false;
}

// ---- GET: verification ----

whatsappRoutes.get("/whatsapp", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge") ?? "";
  const expected = process.env.META_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    logger.info("whatsapp.verify.ok");
    return c.text(challenge, 200);
  }
  logger.warn({ mode, tokenMatch: token === expected }, "whatsapp.verify.fail");
  return c.text("forbidden", 403);
});

// ---- POST: messages + statuses ----

whatsappRoutes.post("/whatsapp", async (c) => {
  const raw = await c.req.text();

  // Meta signs every webhook with HMAC-SHA256 over the raw body using
  // the app secret. If META_APP_SECRET is set, enforce it.
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const sig = c.req.header("x-hub-signature-256") ?? "";
    const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
    const ok =
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) {
      logger.warn("whatsapp.signature.invalid");
      return c.text("forbidden", 403);
    }
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.text("bad json", 400);
  }

  // Meta payload shape:
  //   entry[].changes[].value.messages[]   → inbound user message
  //   entry[].changes[].value.statuses[]   → delivery / read receipts
  //   entry[].changes[].value.metadata.phone_number_id  → which WA number
  const entries = body?.entry ?? [];
  const tasks: Array<Promise<void>> = [];
  for (const e of entries) {
    for (const ch of e?.changes ?? []) {
      const v = ch?.value ?? {};
      const phoneNumberId: string | undefined = v?.metadata?.phone_number_id;
      const messages: any[] = v?.messages ?? [];
      for (const m of messages) {
        if (rememberHandled(m.id)) continue;
        if (isStale(m.timestamp)) continue;
        tasks.push(handleInbound(phoneNumberId, m));
      }
    }
  }

  // Fire-and-forget. Hono returns 200 to Meta now; tasks resolve in the
  // background. Any throw inside handleInbound is caught and logged.
  for (const t of tasks) void t;
  return c.json({ ok: true });
});

// ---- inbound handler ----

async function handleInbound(phoneNumberId: string | undefined, m: any): Promise<void> {
  try {
    const fromNumber: string = "+" + (m?.from ?? "");
    const messageId: string = m?.id ?? "";
    const type: string = m?.type ?? "";

    if (!fromNumber || !messageId) return;

    // We only handle text for now. Voice notes, images, location pins
    // would land in the same shape under different `type` values; future
    // iterations can wire those up (audio → STT → text path, etc.).
    if (type !== "text") {
      logger.info({ type, fromNumber }, "whatsapp.skipped.unsupported_type");
      return;
    }
    const text: string = m?.text?.body ?? "";
    if (!text.trim()) return;

    // Resolve clinic by the WhatsApp Business phone number id Meta sent.
    const clinic = phoneNumberId
      ? await prisma.clinic.findFirst({
          where: { waPhoneNumberId: phoneNumberId, waEnabled: true, isActive: true },
        })
      : null;
    if (!clinic) {
      logger.warn({ phoneNumberId, fromNumber }, "whatsapp.unknown_phone_number_id");
      return;
    }

    logger.info(
      { fromNumber, messageId, len: text.length, clinic: clinic.slug },
      "whatsapp.inbound",
    );

    const { reply } = await runChat({
      clinic,
      clientPhone: fromNumber,
      userText: text,
      messageId,
      channel: "whatsapp",
    });

    if (reply.trim()) {
      await sendWhatsAppText({
        clinic,
        to: fromNumber,
        text: reply,
      });
    }
  } catch (err) {
    logger.error({ err }, "whatsapp.handler.failed");
  }
}

function isStale(timestamp: string | number | undefined): boolean {
  if (!timestamp) return false;
  const ts = typeof timestamp === "string" ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > STALE_AGE_MS;
}
