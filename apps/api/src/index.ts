/**
 * Lavora API — Hono entrypoint.
 *
 * Three traffic shapes share this server:
 *   1. Tool webhooks  /v1/tools/*       (called by Vapi during a live call)
 *   2. Meta webhooks  /v1/webhooks/*    (WhatsApp / Instagram inbound)
 *   3. Internal API   /v1/admin/*       (used by the Next.js dashboard)
 *
 * Auth strategy:
 *   - tool webhooks   → HMAC of body against per-clinic secret (Vapi feature)
 *   - meta webhooks   → x-hub-signature-256 (Meta standard)
 *   - admin           → Supabase JWT in Authorization header
 *
 * Each route group lives in its own file under `routes/`. Keep the
 * top-level here lean.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { initSentry } from "./lib/sentry.js";
import { logger } from "./lib/logger.js";
import { startRecordingsCleanup } from "./lib/recordings-cleanup.js";
import { startReminderRunner } from "./lib/reminders-runner.js";
import { healthRoutes } from "./routes/health.js";
import { toolRoutes } from "./routes/tools.js";
import { webhookRoutes } from "./routes/webhooks.js";

initSentry();
startReminderRunner();
startRecordingsCleanup();

const app = new Hono();

app.use("*", honoLogger());
app.use("*", secureHeaders());
app.use(
  "/v1/admin/*",
  cors({
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

app.route("/v1/health", healthRoutes);
app.route("/v1/tools", toolRoutes);
app.route("/v1/webhooks", webhookRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  logger.error({ err }, "unhandled error");
  return c.json({ error: "internal_error", message: err.message }, 500);
});

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`✓ Lavora API listening on http://localhost:${info.port}`);
});
