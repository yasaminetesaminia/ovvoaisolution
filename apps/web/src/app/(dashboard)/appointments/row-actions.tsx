"use client";

import { useState, useTransition } from "react";
import { Check, MoreHorizontal, X } from "lucide-react";

import { cancelAppointment, markCompleted, markNoShow } from "./actions";

export function RowActions({ appointmentId }: { appointmentId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setOpen(false);
    startTransition(async () => {
      try {
        await fn();
      } catch (e: any) {
        alert(e?.message ?? "Action failed");
      }
    });
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="p-1 rounded-md hover:bg-brand-100 text-neutral-400 hover:text-brand-700 disabled:opacity-40"
        aria-label="Actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-brand-100 rounded-lg shadow-md z-10 text-sm overflow-hidden">
          <button
            className="w-full text-left px-3 py-2 hover:bg-brand-50 flex items-center gap-2 text-emerald-700"
            onClick={() => run(() => markCompleted(appointmentId))}
          >
            <Check className="w-3.5 h-3.5" /> Mark completed
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-brand-50 flex items-center gap-2 text-amber-700"
            onClick={() => run(() => markNoShow(appointmentId))}
          >
            <X className="w-3.5 h-3.5" /> Mark no-show
          </button>
          <div className="border-t border-brand-100" />
          <button
            className="w-full text-left px-3 py-2 hover:bg-rose-50 text-rose-700 flex items-center gap-2"
            onClick={() =>
              run(
                () => cancelAppointment(appointmentId),
                "Cancel this appointment? The caller will not be notified automatically.",
              )
            }
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}
