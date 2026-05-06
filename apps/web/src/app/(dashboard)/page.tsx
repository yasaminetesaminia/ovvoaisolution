import { format, formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Calendar, ChevronRight, Phone, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

import { prisma } from "@lavora/db";

import { LiveBadge } from "@/components/live-badge";
import { getActiveClinic } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const clinic = await getActiveClinic();
  const now = new Date();
  const startOfToday = startOfDayInTz(now, clinic.timezone);
  const startOf7DaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const endOf7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    callsToday,
    bookingsToday,
    bookingsNext7,
    callsLast7,
    activeCallsRaw,
    recentCalls,
    upcomingNext,
    deptBookings,
  ] = await Promise.all([
    prisma.call.count({ where: { clinicId: clinic.id, startedAt: { gte: startOfToday } } }),
    prisma.appointment.count({
      where: { clinicId: clinic.id, createdAt: { gte: startOfToday }, status: "scheduled" },
    }),
    prisma.appointment.count({
      where: {
        clinicId: clinic.id,
        startAt: { gte: now, lt: endOf7Days },
        status: "scheduled",
      },
    }),
    prisma.call.findMany({
      where: { clinicId: clinic.id, startedAt: { gte: startOf7DaysAgo } },
      select: { startedAt: true, outcome: true },
    }),
    prisma.call.findMany({
      where: { clinicId: clinic.id, endedAt: null },
      select: { id: true, startedAt: true },
    }),
    prisma.call.findMany({
      where: { clinicId: clinic.id },
      orderBy: { startedAt: "desc" },
      take: 6,
      include: { client: true },
    }),
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, status: "scheduled", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 6,
      include: { client: true, service: true, doctor: true },
    }),
    prisma.appointment.groupBy({
      by: ["serviceId"],
      where: {
        clinicId: clinic.id,
        startAt: { gte: startOf7DaysAgo, lt: endOf7Days },
        status: { in: ["scheduled", "completed"] },
      },
      _count: { _all: true },
    }),
  ]);

  // Active calls = ongoing right now (started, not yet ended). Show as
  // a stale-tolerant heuristic — anything older than 15 minutes is
  // probably a webhook that never fired the end event.
  const activeCalls = activeCallsRaw.filter(
    (c) => now.getTime() - c.startedAt.getTime() < 15 * 60 * 1000,
  ).length;

  const bookedCallsLast7 = callsLast7.filter((c) => c.outcome === "booked").length;
  const conversion = callsLast7.length === 0
    ? null
    : Math.round((bookedCallsLast7 / callsLast7.length) * 100);

  // Build a 7-day bar chart of call counts (oldest → newest).
  const buckets: Array<{ label: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStart = startOfDayInTz(day, clinic.timezone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const count = callsLast7.filter(
      (c) => c.startedAt >= dayStart && c.startedAt < dayEnd,
    ).length;
    buckets.push({
      label: format(toZonedTime(day, clinic.timezone), "EEE"),
      count,
    });
  }
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  // Department roll-up needs the service rows to label nicely.
  const services = await prisma.service.findMany({
    where: { id: { in: deptBookings.map((d) => d.serviceId) } },
    select: { id: true, department: true },
  });
  const deptCounts = deptBookings.reduce<Record<string, number>>((acc, d) => {
    const dept = services.find((s) => s.id === d.serviceId)?.department ?? "other";
    acc[dept] = (acc[dept] ?? 0) + d._count._all;
    return acc;
  }, {});
  const sortedDepts = Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-neutral-900 mb-1">
            {clinic.name}
          </h1>
          <p className="text-sm text-neutral-500">
            {format(toZonedTime(now, clinic.timezone), "EEEE, d MMMM yyyy")} ·{" "}
            {clinic.timezone}
          </p>
        </div>
        <LiveBadge initialActive={activeCalls > 0} />
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Kpi
          icon={<Phone className="w-4 h-4" />}
          label="Calls today"
          value={callsToday}
        />
        <Kpi
          icon={<Calendar className="w-4 h-4" />}
          label="Bookings today"
          value={bookingsToday}
        />
        <Kpi
          icon={<Users className="w-4 h-4" />}
          label="Next 7 days"
          value={bookingsNext7}
          sub="upcoming bookings"
        />
        <Kpi
          icon={<TrendingUp className="w-4 h-4" />}
          label="Conversion"
          value={conversion === null ? "—" : `${conversion}%`}
          sub="last 7 days"
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* 7-day call volume bar chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-brand-100 p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm uppercase tracking-wider text-neutral-500">
              Calls — last 7 days
            </h2>
            <Link href="/calls" className="text-xs text-brand-700 hover:text-brand-800">
              See all →
            </Link>
          </div>
          <div className="flex items-end gap-3 h-32">
            {buckets.map((b) => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-2">
                <div className="text-xs text-neutral-500 font-medium">{b.count}</div>
                <div
                  className="w-full bg-brand-200 rounded-md transition-all"
                  style={{
                    height: `${Math.max(4, (b.count / maxBucket) * 100)}%`,
                    backgroundColor: b.count === 0 ? "#F2EBDF" : undefined,
                  }}
                />
                <div className="text-xs text-neutral-400">{b.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Department breakdown */}
        <div className="bg-white rounded-2xl border border-brand-100 p-6">
          <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">
            Top departments — last 7 days
          </h2>
          {sortedDepts.length === 0 ? (
            <div className="text-sm text-neutral-400">No bookings yet this week.</div>
          ) : (
            <ul className="space-y-3">
              {sortedDepts.map(([dept, count]) => {
                const max = Math.max(...sortedDepts.map((d) => d[1]));
                return (
                  <li key={dept}>
                    <div className="flex items-baseline justify-between text-sm mb-1">
                      <span className="text-neutral-700 capitalize">
                        {dept.replace(/_/g, " ")}
                      </span>
                      <span className="text-neutral-500 font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 bg-brand-50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Two-column recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityList
          title="Recent calls"
          href="/calls"
          empty="No calls yet — once someone dials the Vapi number, they'll appear live."
          items={recentCalls.map((c) => ({
            href: `/calls/${c.id}`,
            primary: c.client?.name ?? c.fromNumber,
            secondary: c.outcome ?? "no outcome",
            time: formatDistanceToNow(c.startedAt, { addSuffix: true }),
          }))}
        />
        <ActivityList
          title="Upcoming appointments"
          href="/appointments"
          empty="No upcoming bookings yet."
          items={upcomingNext.map((a) => ({
            href: `/appointments`,
            primary: `${a.client.name} — ${a.service.nameEn}`,
            secondary: a.doctor?.name ?? "no doctor",
            time: format(toZonedTime(a.startAt, clinic.timezone), "EEE d MMM, HH:mm"),
          }))}
        />
      </div>
    </div>
  );
}

// --- inline UI primitives (kept here so the page is one self-contained file) ---

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-100 p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-3xl font-medium text-neutral-900">{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </div>
  );
}

function ActivityList({
  title,
  href,
  empty,
  items,
}: {
  title: string;
  href: string;
  empty: string;
  items: Array<{ href: string; primary: string; secondary: string; time: string }>;
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-100 p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500">{title}</h2>
        <Link href={href} className="text-xs text-brand-700 hover:text-brand-800">
          See all →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-brand-100/60 -mx-2">
          {items.map((it, i) => (
            <li key={i}>
              <Link
                href={it.href}
                className="flex items-center gap-3 px-2 py-3 hover:bg-brand-50/40 rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800 truncate">
                    {it.primary}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">{it.secondary}</div>
                </div>
                <div className="text-xs text-neutral-400 shrink-0">{it.time}</div>
                <ChevronRight className="w-4 h-4 text-neutral-300 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- helpers ---

function startOfDayInTz(d: Date, timezone: string): Date {
  const local = toZonedTime(d, timezone);
  local.setHours(0, 0, 0, 0);
  return local;
}
