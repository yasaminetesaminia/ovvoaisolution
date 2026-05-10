"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import type { Holiday } from "@lavora/db";

import { addHoliday, removeHoliday } from "../actions";
import {
  Field,
  FormCard,
  GhostButton,
  Input,
  PrimaryButton,
  Toast,
} from "./form-primitives";

export function HolidaysManager({ holidays }: { holidays: Holiday[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      try {
        await addHoliday(date, reason || null);
        setDate("");
        setReason("");
        setMsg({ kind: "ok", text: "Holiday added." });
      } catch (err: any) {
        setMsg({ kind: "err", text: err?.message ?? "Save failed." });
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Remove this holiday? The clinic will be bookable on this date again.")) return;
    setMsg(null);
    start(async () => {
      try {
        await removeHoliday(id);
        setMsg({ kind: "ok", text: "Holiday removed." });
      } catch (err: any) {
        setMsg({ kind: "err", text: err?.message ?? "Remove failed." });
      }
    });
  }

  return (
    <FormCard
      title="Holidays"
      description="The agent refuses bookings on these dates and proposes the next open day."
    >
      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 mb-4">
        <Field label="Date">
          <Input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Reason (optional)">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Eid Al-Fitr"
          />
        </Field>
        <div className="flex items-end pb-3">
          <PrimaryButton type="submit" pending={pending}>
            Add holiday
          </PrimaryButton>
        </div>
      </form>

      {holidays.length === 0 ? (
        <p className="text-sm text-neutral-400 mt-2">No holidays on file.</p>
      ) : (
        <ul className="divide-y divide-brand-100/60 -mx-2">
          {holidays.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-3 px-2 py-2.5"
            >
              <div>
                <span className="text-sm font-medium text-neutral-800">
                  {h.date.toISOString().slice(0, 10)}
                </span>
                {h.reason && (
                  <span className="text-xs text-neutral-500 ml-2">— {h.reason}</span>
                )}
              </div>
              <GhostButton
                type="button"
                onClick={() => remove(h.id)}
                disabled={pending}
                className="!px-2 !py-1 text-rose-700 hover:!border-rose-300 hover:!text-rose-800"
                aria-label="Remove holiday"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </GhostButton>
            </li>
          ))}
        </ul>
      )}

      {msg && <Toast msg={msg.text} kind={msg.kind} />}
    </FormCard>
  );
}
