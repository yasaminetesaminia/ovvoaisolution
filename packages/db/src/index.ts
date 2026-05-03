/**
 * @lavora/db — Prisma client + types.
 *
 * Use this package whenever you need DB access. Do not instantiate
 * `new PrismaClient()` directly anywhere else; sharing the singleton
 * keeps connection-pool usage sane in serverless environments.
 */

export { prisma } from "./client.js";
export {
  Prisma,
  PrismaClient,
  type Clinic,
  type ClinicUser,
  type Doctor,
  type Service,
  type Holiday,
  type Client,
  type Appointment,
  type Package,
  type Conversation,
  type Message,
  type Call,
  type Reminder,
  type AuditEvent,
  type AppointmentStatus,
  type Channel,
  type ReminderStatus,
} from "@prisma/client";
