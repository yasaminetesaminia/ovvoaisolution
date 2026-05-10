import { CalendarCheck2, Mic, MessageSquare, Phone } from "lucide-react";

import { prisma } from "@lavora/db";

import { getActiveClinic } from "@/lib/auth";

import { ClinicBasicsForm } from "./sections/clinic-basics-form";
import { DoctorsManager } from "./sections/doctors-manager";
import { HolidaysManager } from "./sections/holidays-manager";
import { HoursForm } from "./sections/hours-form";
import { ServicesManager } from "./sections/services-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const clinic = await getActiveClinic();
  const [doctors, services, holidays] = await Promise.all([
    prisma.doctor.findMany({
      where: { clinicId: clinic.id, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { clinicId: clinic.id },
      orderBy: [{ department: "asc" }, { nameEn: "asc" }],
    }),
    prisma.holiday.findMany({
      where: { clinicId: clinic.id },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-neutral-900 mb-1">Settings</h1>
        <p className="text-sm text-neutral-500">
          Configure how the AI agent talks to your callers and what it can book.
        </p>
      </header>

      <ClinicBasicsForm clinic={clinic} />
      <HoursForm clinic={clinic} />
      <HolidaysManager holidays={holidays} />
      <DoctorsManager doctors={doctors} />
      <ServicesManager services={services} />

      {/* Read-only integrations panel — these aren't UI-editable yet */}
      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-sm uppercase tracking-wider text-neutral-500">Integrations</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Wired during onboarding. Contact support to swap providers.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-brand-100 p-5 space-y-4">
          <Field icon={<Mic className="w-4 h-4" />} label="Voice (ElevenLabs)">
            <span className="font-mono text-xs">{clinic.voiceId ?? "—"}</span>
            <div className="text-neutral-500 text-xs mt-1">{clinic.voiceModel}</div>
          </Field>
          <Field icon={<Mic className="w-4 h-4" />} label="Vapi assistant">
            <span className="font-mono text-xs">{clinic.vapiAssistantId ?? "—"}</span>
          </Field>
          <Field icon={<Phone className="w-4 h-4" />} label="Inbound number">
            <span className="font-mono">+1 708 292 0229</span>
          </Field>
          <Field icon={<CalendarCheck2 className="w-4 h-4" />} label="Google Calendar sync">
            {clinic.gcalEnabled ? <Pill ok>Connected</Pill> : <Pill>Disabled</Pill>}
          </Field>
          <Field icon={<MessageSquare className="w-4 h-4" />} label="WhatsApp Business">
            {clinic.waEnabled ? <Pill ok>Connected</Pill> : <Pill>Disabled</Pill>}
          </Field>
        </div>
      </section>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="text-neutral-400 mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-xs uppercase tracking-wider text-neutral-500 mb-0.5">
          {label}
        </div>
        <div className="text-neutral-800">{children}</div>
      </div>
    </div>
  );
}

function Pill({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  const cls = ok
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-neutral-100 text-neutral-500 border-neutral-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${cls}`}>
      {children}
    </span>
  );
}
