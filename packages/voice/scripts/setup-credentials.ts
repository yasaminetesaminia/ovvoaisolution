/**
 * Register provider credentials with Vapi.
 *
 * Vapi needs your ElevenLabs / Anthropic / Deepgram API keys stored as
 * "credentials" in your Vapi org so its workers can call those services
 * on your behalf during a live call. We push the keys we already have
 * in .env so you don't have to paste them in the Vapi dashboard.
 *
 * Idempotent — re-runs are safe; it skips any provider that's already
 * registered.
 *
 *   pnpm --filter @lavora/voice exec dotenv -e ../../.env -- tsx scripts/setup-credentials.ts
 */

const VAPI_BASE = "https://api.vapi.ai";

const apiKey = process.env.VAPI_API_KEY;
if (!apiKey) {
  console.error("VAPI_API_KEY missing.");
  process.exit(1);
}

interface CredSpec {
  provider: string;
  envKey: string;
}

const wanted: CredSpec[] = [
  { provider: "11labs", envKey: "ELEVENLABS_API_KEY" },
  { provider: "anthropic", envKey: "ANTHROPIC_API_KEY" },
  { provider: "deepgram", envKey: "DEEPGRAM_API_KEY" },
  { provider: "openai", envKey: "OPENAI_API_KEY" },
];

async function vapi(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Vapi ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

const existing: Array<{ id: string; provider: string }> = await vapi("GET", "/credential");
const existingProviders = new Set(existing.map((c) => c.provider));

// Continue past individual failures so one bad key doesn't block the rest.
for (const spec of wanted) {
  const value = process.env[spec.envKey];
  if (!value) {
    console.log(`⊘ ${spec.provider}: ${spec.envKey} not in .env, skipped`);
    continue;
  }
  if (existingProviders.has(spec.provider)) {
    console.log(`✓ ${spec.provider}: already registered`);
    continue;
  }
  try {
    const created = await vapi("POST", "/credential", {
      provider: spec.provider,
      apiKey: value,
    });
    console.log(`✓ ${spec.provider}: registered (${(created as any).id})`);
  } catch (e) {
    console.log(`✗ ${spec.provider}: ${(e as Error).message.slice(0, 200)}`);
  }
}

console.log("\nDone.");
process.exit(0);
