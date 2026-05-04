/**
 * Auth + tenant helpers for server components.
 *
 * Day-4 simplification: every signed-in user is treated as a Lavora
 * staff member. We pull the Lavora clinic record by slug and use its
 * id everywhere. When we add real onboarding (post-MVP), this will
 * resolve through the ClinicUser pivot table instead.
 */

import { redirect } from "next/navigation";

import { prisma, type Clinic } from "@lavora/db";

import { getSupabaseServer } from "./supabase/server.js";

export async function requireUser() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

let _cached: Clinic | null = null;

export async function getActiveClinic(): Promise<Clinic> {
  if (_cached) return _cached;
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { slug: "lavora" },
  });
  _cached = clinic;
  return clinic;
}
