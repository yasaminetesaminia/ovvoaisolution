/**
 * Vapi tool-webhook endpoint. Vapi runs the LLM on its side; we only
 * handle the per-tool callbacks. Single-dispatcher endpoint: every
 * tool points at the same URL, function name dispatches in code.
 *
 * The actual handler logic lives in lib/tool-handlers.ts so the chat
 * channel (in-process Claude loop) can call the same code path.
 */

import { Hono } from "hono";

import { logger } from "../lib/logger.js";
import { dispatchTool } from "../lib/tool-handlers.js";
import { vapiAuth } from "../middleware/vapi-auth.js";

export const toolRoutes = new Hono();

toolRoutes.use("*", vapiAuth);

interface VapiToolCall {
  id: string;
  function?: { name: string; arguments: Record<string, unknown> };
}

function extractToolCalls(body: any): VapiToolCall[] {
  return body?.message?.toolCalls ?? body?.message?.tool_calls ?? [];
}

toolRoutes.post("/dispatch", async (c) => {
  const clinicId = c.get("clinicId");
  const body: any = (c as any).get("body");
  const toolCalls = extractToolCalls(body);

  if (toolCalls.length === 0) {
    return c.json({ error: "no_tool_calls" }, 400);
  }

  const callerPhone: string = body?.message?.call?.customer?.number ?? "";

  const results = await Promise.all(
    toolCalls.map(async (tc) => {
      const name = tc.function?.name ?? "";
      const args = tc.function?.arguments ?? {};
      try {
        const out = await dispatchTool(name, args, {
          clinicId,
          callerPhone,
          idempotencyKey: tc.id,
          channel: "voice",
        });
        return {
          toolCallId: tc.id,
          result: typeof out === "string" ? out : JSON.stringify(out),
        };
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
