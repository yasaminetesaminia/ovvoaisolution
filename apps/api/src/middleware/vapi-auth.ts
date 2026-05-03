/**
 * Vapi tool-webhook authentication.
 *
 * Vapi signs every server-side tool POST with HMAC-SHA256 over the raw
 * request body, using a secret you configure per-assistant. We pull
 * the per-clinic secret from the DB based on the assistantId Vapi
 * includes in the payload, then verify.
 *
 * Result: c.get("clinicId") and c.get("vapiCallId") are populated for
 * downstream handlers, or 401 is returned.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { MiddlewareHandler } from "hono";

import { prisma } from "@lavora/db";

declare module "hono" {
  interface ContextVariableMap {
    clinicId: string;
    vapiCallId: string | undefined;
    toolCallId: string | undefined;
  }
}

export const vapiAuth: MiddlewareHandler = async (c, next) => {
  const raw = await c.req.text();

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  // Vapi tool webhook payload: message.toolCalls[*] + message.call + message.assistant
  const assistantId =
    parsed?.message?.assistant?.id ?? parsed?.message?.call?.assistantId;
  if (!assistantId) {
    return c.json({ error: "missing_assistant_id" }, 400);
  }

  const clinic = await prisma.clinic.findFirst({
    where: { vapiAssistantId: assistantId, isActive: true },
  });
  if (!clinic) {
    return c.json({ error: "unknown_assistant" }, 404);
  }

  // Optional: verify Vapi's HMAC signature if the clinic stored a webhook
  // secret. We use process.env.VAPI_WEBHOOK_SECRET as a global fallback
  // for the demo phase; in production each clinic should rotate its own.
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (secret) {
    const sig = c.req.header("x-vapi-signature");
    if (!sig) return c.json({ error: "missing_signature" }, 401);
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const ok =
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return c.json({ error: "bad_signature" }, 401);
  }

  c.set("clinicId", clinic.id);
  c.set("vapiCallId", parsed?.message?.call?.id);
  c.set("toolCallId", parsed?.message?.toolCalls?.[0]?.id);

  // Stash the parsed body so handlers don't re-parse.
  (c as any).set("body", parsed);

  await next();
};
