import { prisma } from "../src/client.js";

const r = await prisma.clinic.update({
  where: { slug: "lavora" },
  data: { voiceModel: "eleven_multilingual_v2" },
});
console.log("✓ voiceModel:", r.voiceModel);
await prisma.$disconnect();
process.exit(0);
