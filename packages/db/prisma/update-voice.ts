/**
 * One-shot helper: store the ElevenLabs voice ID on the Lavora clinic
 * so the Vapi-agent template can pull it without us hardcoding it.
 *
 *   pnpm --filter @lavora/db exec tsx prisma/update-voice.ts <voiceId>
 */

import { prisma } from "../src/client.js";

const voiceId = process.argv[2] ?? process.env.ELEVENLABS_VOICE_ID;
if (!voiceId) {
  console.error("Usage: tsx prisma/update-voice.ts <voiceId>");
  process.exit(1);
}

const updated = await prisma.clinic.update({
  where: { slug: "lavora" },
  data: { voiceId, voiceModel: "eleven_turbo_v2_5" },
});
console.log(`✓ Lavora voice set: ${updated.voiceId} (${updated.voiceModel})`);

await prisma.$disconnect();
