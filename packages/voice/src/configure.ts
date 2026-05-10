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
  /** The /v1/webhooks/vapi URL Vapi should post lifecycle events to
   *  (status updates, end-of-call reports). Defaults to swapping the
   *  /tools/dispatch suffix on `webhookUrl`. */
  serverUrl?: string;
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

  const serverUrl = opts.serverUrl
    ?? opts.webhookUrl.replace(/\/v1\/tools\/dispatch\/?$/, "/v1/webhooks/vapi");

  return {
    name: clinic.name,
    firstMessage: `أهلاً فيك في عيادة لافورا. Welcome to ${clinic.name}.`,
    firstMessageMode: "assistant-speaks-first" as const,
    // Vapi posts lifecycle events (status-update, end-of-call-report)
    // here. Tool calls use a separate per-tool `server` field.
    server: { url: serverUrl, timeoutSeconds: 20 },
    serverMessages: ["status-update", "end-of-call-report"],
    // Transcriber: ElevenLabs Scribe v1. After living through Vapi's
    // Deepgram limitations on Arabic (nova-* don't accept ar; whisper-
    // large drops keyword boost; multi is English-biased on phone audio)
    // we moved to Scribe — trained heavily on Arabic dialects (incl.
    // Khaleeji) and handles Arabic↔English code-switching live.
    // Requires the EL key to carry Speech-to-Text scope; the tenant's
    // current key (Restrict Key=Off) does.
    transcriber: {
      provider: "11labs" as const,
      model: "scribe_v1",
      // language="ar" primes the model toward Arabic but Scribe is
      // multilingual under the hood — it still transcribes English
      // utterances correctly when callers code-switch.
      language: "ar",
    },
    model: {
      provider: "anthropic" as const,
      // Haiku 4.5 over Sonnet 4.6 for live phone latency: live tests
      // showed Sonnet adding 1.5–3s per turn — long enough that
      // callers thought the line was lagging. The mechanical 7-step
      // booking sequence in the prompt + temperature 0.2 + maxTokens
      // 200 keeps Haiku tight on rule adherence.
      model: opts.llmModel ?? "claude-haiku-4-5-20251001",
      temperature: 0.2,
      maxTokens: 200,
      messages: [{ role: "system", content: systemPrompt }],
      tools,
    },
    voice: {
      provider: "11labs" as const,
      voiceId: clinic.voiceId,
      // eleven_turbo_v2_5 is the standard for live calls, but on cloned
      // voices the multilingual_v2 model is noticeably clearer on Arabic
      // — worth the ~400ms extra latency for a luxury-clinic demo.
      model: opts.voiceModel ?? clinic.voiceModel ?? "eleven_multilingual_v2",
      // 0.75 (was 0.70) trades a touch of warmth for fewer pronunciation
      // wobbles — callers were missing the occasional word.
      stability: 0.75,
      similarityBoost: 0.85,
      style: 0.15,
      useSpeakerBoost: true,
      // optimizeStreamingLatency: 2 trades a bit of audio polish for
      // a noticeable first-byte cut. Level 1 was clearer in isolation
      // but combined with chunkPlan it produced audible "stitching"
      // between chunks; we just removed chunkPlan, so 2 is the sweet
      // spot now (clearer than 3, ~150ms faster than 1).
      optimizeStreamingLatency: 2,
      // No chunkPlan — sending whole sentences to TTS at once gives
      // smoother prosody. Slightly higher first-syllable latency on
      // long replies, but the prompt already keeps replies short.
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
