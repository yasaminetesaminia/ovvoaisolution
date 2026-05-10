/**
 * In-process Claude tool-use loop for the chat channel.
 *
 * Voice runs the LLM on Vapi's side; chat runs it here. Same tool
 * handlers (lib/tool-handlers.ts), same anti-hallucination rules,
 * different transport.
 *
 *   1. Pull conversation history from Postgres (last MAX_HISTORY messages).
 *   2. Append the new user message.
 *   3. Run anthropic.messages.create with the chat system prompt + tools.
 *   4. While the response contains tool_use blocks: dispatch each, append
 *      tool_result, and call Anthropic again. Cap at MAX_ITERS.
 *   5. Return the final assistant text + persist messages.
 */

import Anthropic from "@anthropic-ai/sdk";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { buildChatSystemPrompt } from "@lavora/chat";
import { detectLanguage } from "@lavora/core";
import { prisma, type Channel, type Clinic } from "@lavora/db";

import { logger } from "./logger.js";
import { ANTHROPIC_TOOLS, dispatchTool } from "./tool-handlers.js";

const MAX_HISTORY = 30;
const MAX_ITERS = 6;
// Sonnet 4.6 (matches the voice agent) — Haiku at default temperature
// kept hallucinating weekdays even with today's date injected into the
// prompt. Sonnet at temp 0.2 follows the date+weekday context literally.
const MODEL = process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-6";
const TEMPERATURE = 0.2;

let _client: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface RunChatOpts {
  clinic: Clinic;
  /** E.164 phone number of the client (used as both client_phone and the
   *  WhatsApp recipient). */
  clientPhone: string;
  /** The single message that just arrived. */
  userText: string;
  /** WhatsApp message id for idempotent booking on retries. */
  messageId: string;
  channel: Channel;
}

export interface RunChatResult {
  reply: string;
  conversationId: string;
}

export async function runChat(opts: RunChatOpts): Promise<RunChatResult> {
  // 1. Upsert client + conversation.
  const client = await prisma.client.upsert({
    where: { clinicId_phone: { clinicId: opts.clinic.id, phone: opts.clientPhone } },
    update: {},
    create: {
      clinicId: opts.clinic.id,
      phone: opts.clientPhone,
      name: opts.clientPhone, // placeholder until they share a name
      language: detectLanguage(opts.userText),
      source: opts.channel,
    },
  });

  const convo = await prisma.conversation.upsert({
    where: {
      clinicId_clientId_channel: {
        clinicId: opts.clinic.id,
        clientId: client.id,
        channel: opts.channel,
      },
    },
    update: { lastMsgAt: new Date() },
    create: {
      clinicId: opts.clinic.id,
      clientId: client.id,
      channel: opts.channel,
      language: client.language,
    },
  });

  // 2. Persist the inbound message immediately.
  await prisma.message.create({
    data: {
      conversationId: convo.id,
      role: "user",
      content: { type: "text", text: opts.userText },
    },
  });

  // 3. Build context: recent history + this turn.
  const history = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY,
  });

  const messages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    // We always store JSON content. Re-shape for Anthropic.
    content: anthropicShapeFromStored(m.content as any),
  }));

  // 4. Build system prompt with current date/time injected.
  const [doctors, services] = await Promise.all([
    prisma.doctor.findMany({
      where: { clinicId: opts.clinic.id, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { clinicId: opts.clinic.id, isActive: true },
      orderBy: [{ department: "asc" }, { nameEn: "asc" }],
    }),
  ]);
  const nowLocal = toZonedTime(new Date(), opts.clinic.timezone);
  const systemPrompt = buildChatSystemPrompt({
    clinic: opts.clinic,
    doctors,
    services,
    todayYmd: format(nowLocal, "yyyy-MM-dd"),
    todayWeekday: format(nowLocal, "EEEE"),
  });

  const anthropic = getAnthropic();

  let iters = 0;
  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    temperature: TEMPERATURE,
    system: systemPrompt,
    tools: ANTHROPIC_TOOLS as any,
    messages,
  });

  // 5. Tool-use loop.
  while (response.stop_reason === "tool_use" && iters < MAX_ITERS) {
    iters += 1;

    // Persist the assistant turn (with its tool_use blocks).
    await prisma.message.create({
      data: {
        conversationId: convo.id,
        role: "assistant",
        content: response.content as any,
      },
    });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown;
      try {
        result = await dispatchTool(block.name, block.input, {
          clinicId: opts.clinic.id,
          callerPhone: opts.clientPhone,
          // Compose so a Meta retry of the same message doesn't double-book.
          idempotencyKey: `${opts.messageId}:${block.id}`,
          channel: opts.channel,
        });
      } catch (err) {
        logger.error({ err, tool: block.name }, "chat.tool.failed");
        result = { success: false, error: (err as Error).message };
      }
      toolResults.push({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
      });
    }

    // Persist the synthetic user message that delivers tool_results back.
    await prisma.message.create({
      data: {
        conversationId: convo.id,
        role: "user",
        content: toolResults as any,
        toolName: "tool_results",
      },
    });

    messages.push({ role: "assistant", content: response.content as any });
    messages.push({ role: "user", content: toolResults as any });

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: systemPrompt,
      tools: ANTHROPIC_TOOLS as any,
      messages,
    });
  }

  // 6. Persist final assistant response and return its text.
  await prisma.message.create({
    data: {
      conversationId: convo.id,
      role: "assistant",
      content: response.content as any,
    },
  });

  const reply = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { reply, conversationId: convo.id };
}

/** Stored JSON → shape Anthropic expects on resume. The DB has a mix of
 *  user-text strings, full assistant content arrays (with tool_use), and
 *  user tool_result arrays. Pass arrays through; wrap a bare {text}
 *  object as a single text block. */
function anthropicShapeFromStored(content: any): any {
  if (Array.isArray(content)) return content;
  if (content && typeof content === "object" && content.type === "text") {
    return [{ type: "text", text: content.text }];
  }
  if (typeof content === "string") return content;
  return content;
}
