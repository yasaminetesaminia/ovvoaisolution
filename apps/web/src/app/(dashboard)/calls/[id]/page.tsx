import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@lavora/db";

import { getActiveClinic } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clinic = await getActiveClinic();
  const call = await prisma.call.findFirst({
    where: { id, clinicId: clinic.id },
    include: { client: true },
  });
  if (!call) notFound();

  const minutes = Math.round((call.durationSec / 60) * 10) / 10;
  const transcript = call.transcript as any;
  const messages: Array<{ role: string; message: string; time?: number }> =
    Array.isArray(transcript?.messages) ? transcript.messages : [];
  const summary: string | undefined = transcript?.summary;
  const evaluation: string | undefined = transcript?.successEvaluation;

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/calls"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-brand-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to calls
      </Link>

      <header className="mb-8">
        <h1 className="font-serif text-3xl text-neutral-900 mb-2">
          {call.client?.name ?? call.fromNumber}
        </h1>
        <div className="text-sm text-neutral-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>{call.fromNumber}</span>
          <span>·</span>
          <span>
            {format(toZonedTime(call.startedAt, clinic.timezone), "EEEE d MMM, HH:mm")}
          </span>
          <span>·</span>
          <span>{minutes} min</span>
          {call.outcome && (
            <>
              <span>·</span>
              <span className="capitalize text-brand-700">{call.outcome}</span>
            </>
          )}
        </div>
      </header>

      {summary && (
        <section className="mb-8 bg-brand-50/60 border border-brand-100 rounded-2xl p-5">
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Summary</div>
          <p className="text-neutral-800 leading-relaxed">{summary}</p>
          {evaluation && (
            <p className="text-xs text-neutral-500 mt-2">Evaluation: {evaluation}</p>
          )}
        </section>
      )}

      {call.recordingUrl && (
        <section className="mb-8 bg-white border border-brand-100 rounded-2xl p-5">
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Recording</div>
          <audio controls className="w-full">
            <source src={call.recordingUrl} />
          </audio>
        </section>
      )}

      <section>
        <div className="text-xs uppercase tracking-wider text-neutral-500 mb-3">Transcript</div>
        {messages.length === 0 ? (
          <div className="bg-white border border-brand-100 rounded-2xl p-6 text-center text-sm text-neutral-400">
            No transcript available for this call.
          </div>
        ) : (
          <div className="bg-white border border-brand-100 rounded-2xl p-5 space-y-4">
            {messages
              .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool")
              .map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "assistant" ? "" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "assistant"
                        ? "bg-brand-100 text-brand-900 rounded-bl-sm"
                        : m.role === "user"
                        ? "bg-neutral-900 text-white rounded-br-sm"
                        : "bg-neutral-100 text-neutral-500 text-xs"
                    }`}
                    dir="auto"
                  >
                    {m.role === "tool" && (
                      <div className="text-[10px] uppercase tracking-wider mb-1 text-neutral-400">
                        Tool call
                      </div>
                    )}
                    {m.message}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
