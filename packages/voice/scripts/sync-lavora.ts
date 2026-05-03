/**
 * Sync the Lavora clinic config from Postgres to its Vapi assistant.
 *
 * Run after any change to the prompt / services / doctors / voice. We
 * generate the assistant document fresh from the DB and PATCH it up.
 *
 *   pnpm --filter @lavora/voice sync:lavora
 */

import { syncToVapi } from "../src/configure.js";

const apiUrl = process.env.API_URL ?? "http://localhost:8787";
const webhookUrl = `${apiUrl.replace(/\/+$/, "")}/v1/tools/dispatch`;

const apiKey = process.env.VAPI_API_KEY;
if (!apiKey) {
  console.error("VAPI_API_KEY is missing. Add it to .env first.");
  process.exit(1);
}

console.log(`→ Syncing Lavora to Vapi (webhook: ${webhookUrl})`);
await syncToVapi("lavora", apiKey, { webhookUrl });
console.log("✓ Lavora assistant updated on Vapi.");
process.exit(0);
