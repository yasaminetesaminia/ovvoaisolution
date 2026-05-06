import {
  CalendarCheck2,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  Phone,
} from "lucide-react";

import { prisma } from "@lavora/db";

import { getActiveClinic } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEPT_LABEL: Record<string, string> = {
  dermatology: "Dermatology & Skin Care",
  aesthetics: "Non-Surgical Aesthetics",
  regenerative: "Regenerative & Cellular Therapies",
  slimming: "Body Slimming",
  gynecology: "Aesthetic Gynecology",
  laser_hair_removal: "Laser Hair Removal",
};

export default async function SettingsPage() {
  const clinic = await getActiveClinic();
  const [doctors, services, holidays] = await Promise.all([
    prisma.doctor.findMany({
      where: { clinicId: clinic.id, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { clinicId: clinic.id, isActive: true },
      orderBy: [{ department: "asc" }, { nameEn: "asc" }],
    }),
    prisma.holiday.findMany({
      where: { clinicId: clinic.id },
      orderBy: { date: "asc" },
    }),
  ]);

  // Group services by department once for the catalog block.
  const servicesByDept = services.reduce<Record<string, typeof services>>(
    (acc, s) => {
      (acc[s.department] ??= []).push(s);
      return acc;
    },
    {},
  );

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-neutral-900 mb-1">Settings</h1>
        <p className="text-sm text-neutral-500">
          Read-only view of how the AI agent and reminders are configured. Edit support comes next.
        </p>
      </header>

      <Section title="Clinic">
        <Field icon={<Phone className="w-4 h-4" />} label="Phone">
          {clinic.phone ?? "—"}
        </Field>
        <Field icon={<Mail className="w-4 h-4" />} label="Email">
          {clinic.email ?? "—"}
        </Field>
        <Field icon={<Globe className="w-4 h-4" />} label="Website">
          {clinic.website ?? "—"}
        </Field>
        <Field icon={<MapPin className="w-4 h-4" />} label="Address">
          <div>{clinic.addressEn ?? "—"}</div>
          <div className="text-neutral-500 text-xs mt-1" dir="rtl">
            {clinic.addressAr ?? ""}
          </div>
        </Field>
      </Section>

      <Section title="Hours">
        <Field icon={<CalendarCheck2 className="w-4 h-4" />} label="Working hours">
          {clinic.workingStart} – {clinic.workingEnd} ({clinic.timezone})
        </Field>
        <Field icon={<CalendarCheck2 className="w-4 h-4" />} label="Closed weekday">
          {clinic.closedDay}
        </Field>
        <Field icon={<CalendarCheck2 className="w-4 h-4" />} label="Holidays on file">
          {holidays.length === 0 ? (
            <span className="text-neutral-400">none</span>
          ) : (
            <ul className="list-disc list-inside">
              {holidays.map((h) => (
                <li key={h.id}>
                  {h.date.toISOString().slice(0, 10)}
                  {h.reason ? ` — ${h.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Field>
      </Section>

      <Section title="Voice agent">
        <Field icon={<Mic className="w-4 h-4" />} label="Voice (ElevenLabs)">
          <span className="font-mono text-xs">{clinic.voiceId ?? "—"}</span>
          <div className="text-neutral-500 text-xs mt-1">{clinic.voiceModel}</div>
        </Field>
        <Field icon={<Mic className="w-4 h-4" />} label="Vapi assistant">
          <span className="font-mono text-xs">{clinic.vapiAssistantId ?? "—"}</span>
        </Field>
        <Field icon={<Phone className="w-4 h-4" />} label="Inbound number">
          <span className="font-mono">{clinic.twilioNumber ?? "+1 708 292 0229"}</span>
        </Field>
      </Section>

      <Section title="Channels">
        <Field icon={<CalendarCheck2 className="w-4 h-4" />} label="Google Calendar sync">
          {clinic.gcalEnabled ? (
            <Pill ok>Connected</Pill>
          ) : (
            <Pill>Disabled</Pill>
          )}
        </Field>
        <Field icon={<MessageSquare className="w-4 h-4" />} label="WhatsApp Business">
          {clinic.waEnabled ? <Pill ok>Connected</Pill> : <Pill>Disabled</Pill>}
        </Field>
      </Section>

      <Section title={`Doctors (${doctors.length})`}>
        <ul className="divide-y divide-brand-100/60 -mx-2">
          {doctors.map((d) => (
            <li key={d.id} className="py-3 px-2">
              <div className="font-medium text-neutral-800">{d.name}</div>
              {d.title && <div className="text-xs text-neutral-500">{d.title}</div>}
              {d.specialties.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {d.specialties.map((s) => (
                    <span
                      key={s}
                      className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 capitalize"
                    >
                      {s.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Service catalog (${services.length})`}>
        {Object.entries(servicesByDept).map(([dept, list]) => (
          <div key={dept} className="mb-6 last:mb-0">
            <h3 className="text-sm font-medium text-neutral-700 mb-2">
              {DEPT_LABEL[dept] ?? dept}
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-t border-brand-100/60">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-neutral-800">{s.nameEn}</div>
                      <div className="text-xs text-neutral-500" dir="rtl">
                        {s.nameAr ?? ""}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-neutral-500 whitespace-nowrap">
                      {s.durationMinutes} min
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {s.priceMinor ? (
                        <>
                          <span className="font-medium">
                            {(s.priceMinor / 1000).toFixed(0)} OMR
                          </span>
                          {s.priceUnit && (
                            <div className="text-xs text-neutral-400">{s.priceUnit}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">{title}</h2>
      <div className="bg-white rounded-2xl border border-brand-100 p-5 space-y-4">
        {children}
      </div>
    </section>
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
