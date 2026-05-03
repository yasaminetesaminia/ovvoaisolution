/**
 * Tool definitions in Vapi's function-tool format.
 *
 * Vapi's function tool schema is JSON-Schema-shaped (similar to OpenAI's
 * tool format) but with Vapi-specific extras like `server.url` for the
 * webhook destination and `messages` for default fallback responses.
 *
 * The single dispatcher endpoint at /v1/tools/dispatch handles all of
 * these — Vapi sends each invocation with the function name + args,
 * we route in code. So every tool here points to the same URL.
 */

export interface VapiToolConfig {
  webhookUrl: string;
}

export function buildVapiTools(config: VapiToolConfig) {
  const server = { url: config.webhookUrl, timeoutSeconds: 25 };

  return [
    {
      type: "function" as const,
      function: {
        name: "check_available_slots",
        description:
          "Check available appointment slots for a specific service on a given date. Returns slots grouped by morning/afternoon/evening so the agent can offer the right times. Call this BEFORE mentioning any specific time to the caller.",
        parameters: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description: "The date to check, in YYYY-MM-DD format (clinic-local).",
            },
            service_key: {
              type: "string",
              description:
                "The service identifier, e.g. 'botox', 'frax_pro', 'prp', 'lhr_bikini'. Get the list from the system prompt's services menu.",
            },
            doctor_id: {
              type: "string",
              description:
                "Optional. Specific doctor ID, only when the caller has chosen a doctor for departments that have multiple specialists.",
            },
          },
          required: ["date", "service_key"],
        },
      },
      server,
    },
    {
      type: "function" as const,
      function: {
        name: "book_appointment",
        description:
          "Book an appointment for the caller at a specific date and time. ONLY call this after check_available_slots returned the time as available. Returns success/failure plus an appointment_id.",
        parameters: {
          type: "object",
          properties: {
            client_name: {
              type: "string",
              description: "Caller's full name (ask if you don't have it).",
            },
            service_key: {
              type: "string",
              description: "Service key, same as in check_available_slots.",
            },
            doctor_id: {
              type: "string",
              description:
                "Optional. Doctor ID for multi-doctor departments. Leave empty for slimming and laser_hair_removal.",
            },
            date: {
              type: "string",
              description: "Appointment date YYYY-MM-DD.",
            },
            time: {
              type: "string",
              description: "Appointment time HH:MM (24h).",
            },
            language: {
              type: "string",
              enum: ["en", "ar"],
              description:
                "The conversation language — used to send the WhatsApp reminder in the same language.",
            },
            notes: {
              type: "string",
              description: "Optional caller-provided notes.",
            },
          },
          required: ["client_name", "service_key", "date", "time", "language"],
        },
      },
      server,
    },
    {
      type: "function" as const,
      function: {
        name: "get_my_appointment",
        description:
          "Look up the caller's nearest upcoming appointment using their phone number. Use this BEFORE cancel_appointment so you can read it back to them. Call when caller asks 'what's my appointment' or starts a cancel flow.",
        parameters: { type: "object", properties: {}, required: [] },
      },
      server,
    },
    {
      type: "function" as const,
      function: {
        name: "cancel_appointment",
        description:
          "Cancel the caller's nearest upcoming appointment. Always call get_my_appointment FIRST and confirm with the caller before invoking this.",
        parameters: { type: "object", properties: {}, required: [] },
      },
      server,
    },
    {
      type: "function" as const,
      function: {
        name: "list_services",
        description:
          "Return the clinic's service catalog (all departments, names, prices, durations). Only call this when the caller asks 'what do you offer' — DON'T call it on every booking; the system prompt already has the menu.",
        parameters: { type: "object", properties: {}, required: [] },
      },
      server,
    },
  ];
}
