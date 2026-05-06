import { format, formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Languages, MessageSquare, PhoneCall, Users } from "lucide-react";

import { prisma } from "@lavora/db";

import { getActiveClinic } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClientsPage() {
  const clinic = await getActiveClinic();

  // Pull clients + a precomputed appointment summary in one round-trip.
  // Capped at 200 because the sidebar nav doesn't paginate yet — that's
  // a Day-7 polish if the demo clinic grows past it.
  const clients = await prisma.client.findMany({
    where: { clinicId: clinic.id },
    take: 200,
    orderBy: { updatedAt: "desc" },
    include: {
      appointments: {
        select: { id: true, startAt: true, status: true },
      },
    },
  });

  const totals = {
    all: clients.length,
    arabic: clients.filter((c) => c.language === "ar").length,
    voice: clients.filter((c) => c.source === "voice").length,
    whatsapp: clients.filter((c) => c.source === "whatsapp").length,
  };

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-neutral-900 mb-1">Clients</h1>
        <p className="text-sm text-neutral-500">
          Everyone who has ever called or messaged Lavora. Last update first.
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <Stat icon={<Users className="w-4 h-4" />} label="Total clients" value={totals.all} />
        <Stat icon={<Languages className="w-4 h-4" />} label="Arabic" value={totals.arabic} />
        <Stat icon={<PhoneCall className="w-4 h-4" />} label="From voice" value={totals.voice} />
        <Stat icon={<MessageSquare className="w-4 h-4" />} label="From WhatsApp" value={totals.whatsapp} />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">All clients</h2>
        <div className="bg-white rounded-2xl border border-brand-100 overflow-hidden">
          {clients.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-400 text-sm">
                No clients yet. They'll appear here automatically the first time they call or message.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-50/40">
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>Language</Th>
                  <Th>Total visits</Th>
                  <Th>Upcoming</Th>
                  <Th>Last seen</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const upcoming = c.appointments.filter(
                    (a) => a.status === "scheduled" && a.startAt >= new Date(),
                  ).length;
                  const completed = c.appointments.filter(
                    (a) => a.status === "completed",
                  ).length;
                  return (
                    <tr key={c.id} className="border-t border-brand-100/60 hover:bg-brand-50/30">
                      <Td>
                        <div className="font-medium text-neutral-800">{c.name}</div>
                        {c.tags.length > 0 && (
                          <div className="text-xs text-neutral-500 mt-0.5">
                            {c.tags.join(" · ")}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <span className="font-mono text-xs">{c.phone}</span>
                      </Td>
                      <Td>
                        <span className="text-xs uppercase tracking-wider">{c.language}</span>
                      </Td>
                      <Td>{completed}</Td>
                      <Td>
                        {upcoming > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {upcoming} scheduled
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-neutral-600">
                          {formatDistanceToNow(c.updatedAt, { addSuffix: true })}
                        </span>
                        <div className="text-xs text-neutral-400">
                          {format(toZonedTime(c.createdAt, clinic.timezone), "d MMM yyyy")}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-xs uppercase tracking-wider text-neutral-500">
                          {c.source}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-100 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-medium text-neutral-900">{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-xs uppercase tracking-wider text-neutral-400 px-4 py-3">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
