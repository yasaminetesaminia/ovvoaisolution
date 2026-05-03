/**
 * Build the full Vapi assistant config for a clinic and PUT it up.
 *
 * The assistant config in Vapi is a single JSON document that bundles:
 *   - the LLM provider + model + system prompt + tools
 *   - the STT provider/model
 *   - the TTS provider + voice
 *   - the first message
 *   - voicemail / endpoint behaviour
 *
 * We render this from a Clinic row + its catalog so adding a new clinic
 * is just: insert clinic → run sync → live agent.
 */

import { prisma } from "@lavora/db";

import { buildLavoraSystemPrompt } from "./prompts/lavora.js";
import { buildVapiTools } from "./tools.js";
import { VapiClient } from "./vapi.js";

export interface SyncOptions {
  /** The /v1/tools/dispatch URL Vapi should call when the agent uses a tool. */
  webhookUrl: string;
  /** Defaults to "claude-haiku-4-5-20251001" — Anthropic's fastest. */
  llmModel?: string;
  /** Override the default voice model on ElevenLabs. */
  voiceModel?: string;
}

export async function buildAssistantConfig(clinicId: string, opts: SyncOptions) {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
  });
  const [doctors, services] = await Promise.all([
    prisma.doctor.findMany({
      where: { clinicId, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { clinicId, isActive: true },
      orderBy: [{ department: "asc" }, { nameEn: "asc" }],
    }),
  ]);

  const systemPrompt = buildLavoraSystemPrompt({ clinic, doctors, services });
  const tools = buildVapiTools({ webhookUrl: opts.webhookUrl });

  if (!clinic.voiceId) {
    throw new Error(
      `Clinic ${clinic.slug} has no voiceId set. Run prisma/update-voice.ts first.`,
    );
  }

  return {
    name: clinic.name,
    firstMessage: `أهلاً فيك في عيادة لافورا. Welcome to ${clinic.name}.`,
    firstMessageMode: "assistant-speaks-first" as const,
    // The bilingual greeting + Arabic-script prompt content benefit from
    // a multilingual transcriber. nova-3 with language=multi handles
    // Arabic + English code-switching well at sub-second latency.
    transcriber: {
      provider: "deepgram" as const,
      model: "nova-3",
      language: "multi",
      smartFormat: true,
    },
    model: {
      provider: "anthropic" as const,
      model: opts.llmModel ?? "claude-haiku-4-5-20251001",
      temperature: 0.4,
      maxTokens: 250,
      messages: [{ role: "system", content: systemPrompt }],
      tools,
    },
    voice: {
      provider: "11labs" as const,
      voiceId: clinic.voiceId,
      model: opts.voiceModel ?? clinic.voiceModel ?? "eleven_turbo_v2_5",
      stability: 0.7,
      similarityBoost: 0.85,
      style: 0.15,
      useSpeakerBoost: true,
      // Lower latency profile — Vapi will request streaming audio.
      optimizeStreamingLatency: 3,
    },
    // After 30s of silence, end the call gracefully.
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600, // 10 minutes — calls longer than this are usually stuck.
    // Better than the default robotic backchannels for our concierge tone.
    backchannelingEnabled: false,
    backgroundDenoisingEnabled: true,
    // Vapi end-of-call summary — useful for the dashboard later.
    analysisPlan: {
      summaryPrompt:
        "Summarise this call in one sentence. Include: caller intent (booking / cancel / info), final outcome (booked / cancelled / unresolved), any service or doctor mentioned.",
      successEvaluationPrompt:
        "Did the caller successfully accomplish their goal? Reply with 'success' or 'partial' or 'failure' and a one-sentence reason.",
    },
  };
}

export async function syncToVapi(
  clinicSlug: string,
  vapiKey: string,
  opts: SyncOptions,
): Promise<void> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { slug: clinicSlug },
  });
  if (!clinic.vapiAssistantId) {
    throw new Error(
      `Clinic ${clinicSlug} has no vapiAssistantId. Run prisma/link-vapi.ts first.`,
    );
  }

  const config = await buildAssistantConfig(clinic.id, opts);
  const vapi = new VapiClient(vapiKey);
  await vapi.updateAssistant(clinic.vapiAssistantId, config);
}
