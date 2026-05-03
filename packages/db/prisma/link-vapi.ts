/**
 * One-shot helper: link the Vapi assistant ID to the Lavora clinic so
 * the api's vapi-auth middleware can route incoming tool webhooks to
 * the correct tenant (lookup by assistantId → clinic).
 *
 *   pnpm --filter @lavora/db exec dotenv -e ../../.env -- tsx prisma/link-vapi.ts <assistantId>
 */

import { prisma } from "../src/client.js";

const assistantId = process.argv[2];
if (!assistantId) {
  console.error("Usage: tsx prisma/link-vapi.ts <assistantId>");
  process.exit(1);
}

const updated = await prisma.clinic.update({
  where: { slug: "lavora" },
  data: { vapiAssistantId: assistantId },
});
console.log(`✓ Lavora linked to Vapi assistant: ${updated.vapiAssistantId}`);

await prisma.$disconnect();
