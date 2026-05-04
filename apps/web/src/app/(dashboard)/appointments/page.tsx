import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { prisma } from "@lavora/db";

import { getActiveClinic } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-neutral-100 text-neutral-700 border-neutral-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  no_show: "bg-amber-50 text-amber-700 border-amber-200",
};

export default async function AppointmentsPage() {
  const clinic = await getActiveClinic();
  const now = new Date();

  const [upcoming, recent, todayCount, weekCount] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, status: "scheduled", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 50,
      include: { service: true, doctor: true, client: true },
    }),
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, status: { in: ["completed", "cancelled", "no_show"] } },
      orderBy: { startAt: "desc" },
      take: 20,
      include: { service: true, doctor: true, client: true },
    }),
    prisma.appointment.count({
      where: {
        clinicId: clinic.id,
        startAt: { gte: startOfDay(now, clinic.timezone), lt: endOfDay(now, clinic.timezone) },
      },
    }),
    prisma.appointment.count({
      where: {
        clinicId: clinic.id,
        startAt: { gte: now, lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        status: "scheduled",
      },
    }),
  ]);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-neutral-900 mb-1">Appointments</h1>
        <p className="text-sm text-neutral-500">
          {clinic.name} · {clinic.timezone}
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Stat label="Today" value={todayCount} sub="bookings" />
        <Stat label="Next 7 days" value={weekCount} sub="upcoming" />
        <Stat label="Recent activity" value={recent.length} sub="last 20" />
      </section>

      <section className="mb-12">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Upcoming</h2>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Client</Th>
              <Th>Service</Th>
              <Th>Doctor</Th>
              <Th>Source</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-neutral-400 text-sm">
                  No upcoming appointments yet — try booking one via the voice agent.
                </td>
              </tr>
            ) : (
              upcoming.map((a) => (
                <tr key={a.id} className="border-t border-brand-100/60">
                  <Td>
                    <div className="font-medium text-neutral-800">
                      {format(toZonedTime(a.startAt, clinic.timezone), "EEE d MMM")}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {format(toZonedTime(a.startAt, clinic.timezone), "HH:mm")} ·{" "}
                      {a.service.durationMinutes} min
                    </div>
                  </Td>
                  <Td>
                    <div className="text-neutral-800">{a.client.name}</div>
                    <div className="text-xs text-neutral-500">{a.client.phone}</div>
                  </Td>
                  <Td>
                    <div className="text-neutral-800">{a.service.nameEn}</div>
                    <div className="text-xs text-neutral-500 capitalize">{a.service.department.replace(/_/g, " ")}</div>
                  </Td>
                  <Td>{a.doctor?.name ?? <span className="text-neutral-400">—</span>}</Td>
                  <Td>
                    <span className="text-xs uppercase tracking-wider text-neutral-500">{a.source}</span>
                  </Td>
                  <Td>
                    <Pill className={STATUS_STYLE[a.status] ?? ""}>{a.status}</Pill>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Recent activity</h2>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Client</Th>
              <Th>Service</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-neutral-400 text-sm">
                  No completed or cancelled appointments yet.
                </td>
              </tr>
            ) : (
              recent.map((a) => (
                <tr key={a.id} className="border-t border-brand-100/60">
                  <Td>{format(toZonedTime(a.startAt, clinic.timezone), "d MMM, HH:mm")}</Td>
                  <Td>{a.client.name}</Td>
                  <Td>{a.service.nameEn}</Td>
                  <Td>
                    <Pill className={STATUS_STYLE[a.status] ?? ""}>{a.status}</Pill>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}

// --- tiny inline UI primitives ---

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-brand-100 p-5">
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-medium text-neutral-900">{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-brand-100 overflow-hidden">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-xs uppercase tracking-wider text-neutral-400 px-4 py-3 bg-brand-50/40">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
}

function Pill({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${className}`}>
      {children}
    </span>
  );
}

// --- timezone helpers (cheap; no need for a full date lib) ---
function startOfDay(d: Date, tz: string): Date {
  const local = toZonedTime(d, tz);
  local.setHours(0, 0, 0, 0);
  return local;
}
function endOfDay(d: Date, tz: string): Date {
  const local = toZonedTime(d, tz);
  local.setHours(23, 59, 59, 999);
  return local;
}
