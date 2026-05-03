import { Hono } from "hono";

import { prisma } from "@lavora/db";

export const healthRoutes = new Hono();

// Liveness — is the process up?
healthRoutes.get("/", (c) => c.json({ ok: true }));

// Readiness — can we reach the DB?
healthRoutes.get("/ready", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ ok: true, db: "up" });
  } catch (err) {
    return c.json({ ok: false, db: "down", error: String(err) }, 503);
  }
});
