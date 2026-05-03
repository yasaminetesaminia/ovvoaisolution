/**
 * @lavora/db — Prisma client + types.
 *
 * Use this package whenever you need DB access. Do not instantiate
 * `new PrismaClient()` directly anywhere else; sharing the singleton
 * keeps connection-pool usage sane in serverless environments.
 */

export { prisma, type PrismaClient } from "./client.js";
export * from "@prisma/client";
