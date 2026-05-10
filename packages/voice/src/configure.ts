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
    // Transcriber: Deepgram via Vapi doesn't expose Arabic on either
    // nova-2 or nova-3 (their language allowlists for those models
    // skip "ar"). The only Arabic-capable Deepgram model on Vapi is
    // whisper-large, which is what we use here. whisper rejects the
    // `keywords` parameter — passing it crashed the pipeline with
    // `pipeline-error-deepgram-transcriber-failed` and dropped every
    // call. Keeping the config minimal accordingly.
    //
    // Production Lavora is in Muscat → Arabic is the dominant language.
    // English callers can switch by explicitly saying "English please"
    // and the LLM is instructed to detect that pattern even from a
    // partially garbled Arabic transcript.
    transcriber: {
      provider: "deepgram" as const,
      model: "whisper-large",
      language: "ar",
    },
    model: {
      provider: "anthropic" as const,
      // Sonnet 4.6 follows the anti-hallucination rules far more
      // strictly than Haiku — Haiku was occasionally announcing
      // bookings without calling book_appointment first. The extra
      // ~400ms per turn is acceptable for a luxury demo.
      model: opts.llmModel ?? "claude-sonnet-4-6",
      // Lower temperature → less "creative" interpretation of the
      // tool-use rules. We want literal compliance, not riffing.
      temperature: 0.2,
      maxTokens: 250,
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
      // 1 (was 3): minimal latency optimisation, maximum audio quality.
      // 3 was clipping consonants on the cloned voice, especially in Arabic.
      optimizeStreamingLatency: 1,
      // Tiny chunk plan keeps the first audio coming fast even at quality 1.
      // Vapi only accepts a fixed allowlist of punctuation boundaries —
      // Arabic comma "،" is supported but Arabic ?/; are not, so we rely
      // on the Latin equivalents (sentences in Arabic still get split on
      // periods and Arabic comma).
      chunkPlan: {
        enabled: true,
        minCharacters: 30,
        punctuationBoundaries: [".", "!", "?", "،", ":", ";"],
      },
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
