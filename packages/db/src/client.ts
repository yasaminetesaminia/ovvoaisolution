/**
 * Prisma client singleton.
 *
 * Why a singleton: in serverless / dev-reload environments (Next.js,
 * Vercel functions) every hot-reload would otherwise create a new
 * PrismaClient, exhausting the Postgres connection pool within minutes.
 * Caching on `globalThis` survives module re-evaluation.
 */

import { PrismaClient } from "../prisma-client/index.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
