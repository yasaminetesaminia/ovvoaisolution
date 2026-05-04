/**
 * One-shot helper: link Lavora to its existing Google Calendar +
 * WhatsApp Business sender (re-using infra from the legacy Noora
 * deployment so we don't spend a day re-creating them).
 *
 *   pnpm --filter @lavora/db exec dotenv -e ../../.env -- tsx prisma/link-channels.ts
 */

import { prisma } from "../src/client.js";

const r = await prisma.clinic.update({
  where: { slug: "lavora" },
  data: {
    gcalCalendarId:
      "014e3287b08f72751d5c67ecc1b1aedff3c79cb5b00e82c50e9a928d6ecef385@group.calendar.google.com",
    gcalEnabled: true,
    waPhoneNumberId: "1080936985094776",
    waEnabled: true,
  },
});
console.log("✓ Calendar:", r.gcalCalendarId);
console.log("✓ WhatsApp:", r.waPhoneNumberId);
await prisma.$disconnect();
process.exit(0);
