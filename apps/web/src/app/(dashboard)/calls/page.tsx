import { format, formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Phone } from "lucide-react";

import { prisma } from "@lavora/db";

import { getActiveClinic } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CallsPage() {
  const clinic = await getActiveClinic();

  const [calls, total24h, totalCost24h] = await Promise.all([
    prisma.call.findMany({
      where: { clinicId: clinic.id },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { client: true },
    }),
    prisma.call.count({
      where: {
        clinicId: clinic.id,
        startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.call.aggregate({
      where: {
        clinicId: clinic.id,
        startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      _sum: { costUsd: true, durationSec: true },
    }),
  ]);

  const totalMin = Math.round(((totalCost24h._sum.durationSec ?? 0) / 60) * 10) / 10;
  const totalUsd = Number(totalCost24h._sum.costUsd ?? 0).toFixed(2);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-neutral-900 mb-1">Calls</h1>
        <p className="text-sm text-neutral-500">
          Inbound calls handled by the AI receptionist over the last 30 days.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Stat label="Last 24h" value={total24h} sub="calls" />
        <Stat label="Talk time" value={`${totalMin} min`} sub="last 24h" />
        <Stat label="Cost" value={`$${totalUsd}`} sub="last 24h (Vapi)" />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Recent calls</h2>
        <div className="bg-white rounded-2xl border border-brand-100 overflow-hidden">
          {calls.length === 0 ? (
            <div className="text-center py-16">
              <Phone className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-400 text-sm">
                No calls yet. Once someone calls the Vapi number, they'll appear here in real time.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-brand-100/60">
              {calls.map((c) => {
                const minutes = Math.round((c.durationSec / 60) * 10) / 10;
                return (
                  <li key={c.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-neutral-800">
                            {c.client?.name ?? c.fromNumber}
                          </span>
                          {c.outcome && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 capitalize">
                              {c.outcome}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {c.fromNumber} ·{" "}
                          {format(toZonedTime(c.startedAt, clinic.timezone), "d MMM HH:mm")} ·{" "}
                          {minutes} min
                        </div>
                        {c.transcript && Array.isArray((c.transcript as any).messages) && (
                          <p className="text-sm text-neutral-600 mt-2 line-clamp-2">
                            {firstUserMessage(c.transcript)}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-neutral-400">
                          {formatDistanceToNow(c.startedAt, { addSuffix: true })}
                        </div>
                        {c.recordingUrl && (
                          <a
                            href={c.recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-brand-700 hover:text-brand-800 underline mt-1 inline-block"
                          >
                            Recording ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-100 p-5">
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-medium text-neutral-900">{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </div>
  );
}

function firstUserMessage(transcript: unknown): string {
  try {
    const msgs = (transcript as any)?.messages ?? [];
    const first = msgs.find((m: any) => m.role === "user");
    return first?.message ?? "";
  } catch {
    return "";
  }
}
