/**
 * @lavora/chat — outbound WhatsApp / Instagram messaging.
 *
 * MVP scope is outbound only: appointment confirmations, 24h reminders,
 * waitlist notifications. Inbound webhook handling lands later when we
 * port the chat receptionist over from the legacy stack.
 *
 * Per-clinic auth: each clinic stores its own Meta access token + phone
 * number id on its `clinics` row. Falls back to global env values for
 * the demo phase so we don't have to re-onboard Lavora's WhatsApp.
 */

import type { Clinic } from "@lavora/db";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface SendTextOpts {
  clinic: Clinic;
  /** E.164 phone number, no leading + (Meta wants "9681234567"-style). */
  to: string;
  text: string;
}

export async function sendWhatsAppText(opts: SendTextOpts): Promise<{ messageId: string | null }> {
  if (!opts.clinic.waEnabled) return { messageId: null };

  const token = opts.clinic.waToken ?? process.env.WHATSAPP_TOKEN;
  const phoneId = opts.clinic.waPhoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    throw new Error(
      `WhatsApp not configured for clinic ${opts.clinic.slug} ` +
        `(missing token or phone number id).`,
    );
  }

  const cleanTo = opts.to.replace(/^\+/, "").replace(/\s+/g, "");

  const res = await fetch(`${GRAPH_BASE}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: cleanTo,
      type: "text",
      text: { body: opts.text },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    // 401 → token expired; 4xx body usually has Meta's error code
    throw new Error(`WhatsApp send failed ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = JSON.parse(body);
  return { messageId: json?.messages?.[0]?.id ?? null };
}

/** Render the 24-hour reminder text in the appointment's stored language. */
export function renderReminderText(opts: {
  clinicName: string;
  serviceName: string;
  doctorName: string | null;
  startAtLocal: string; // already formatted
  language: "en" | "ar";
}): string {
  const { clinicName, serviceName, doctorName, startAtLocal, language } = opts;
  if (language === "ar") {
    return [
      `تذكير بموعدك في ${clinicName} 👋`,
      "",
      `📋 ${serviceName}${doctorName ? ` مع ${doctorName}` : ""}`,
      `🕐 ${startAtLocal}`,
      "",
      "نشوفك يا غالية 😊",
    ].join("\n");
  }
  return [
    `Reminder of your appointment at ${clinicName} 👋`,
    "",
    `📋 ${serviceName}${doctorName ? ` with ${doctorName}` : ""}`,
    `🕐 ${startAtLocal}`,
    "",
    "See you then 😊",
  ].join("\n");
}
