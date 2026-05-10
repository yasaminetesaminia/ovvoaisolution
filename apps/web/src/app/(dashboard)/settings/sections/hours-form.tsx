"use client";

import { useState, useTransition } from "react";

import type { Clinic } from "@lavora/db";

import { updateClinicHours } from "../actions";
import {
  Field,
  FormCard,
  Input,
  PrimaryButton,
  Select,
  Toast,
} from "./form-primitives";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function HoursForm({ clinic }: { clinic: Clinic }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({
    workingStart: clinic.workingStart,
    workingEnd: clinic.workingEnd,
    closedDay: clinic.closedDay as (typeof WEEKDAYS)[number],
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      try {
        await updateClinicHours(form);
        setMsg({ kind: "ok", text: "Hours updated." });
      } catch (err: any) {
        setMsg({ kind: "err", text: err?.message ?? "Save failed." });
      }
    });
  }

  return (
    <FormCard
      title="Working hours"
      description={`Times in ${clinic.timezone}. Same hours every working day.`}
    >
      <form onSubmit={submit}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
          <Field label="Open at">
            <Input
              type="time"
              value={form.workingStart}
              onChange={(e) => setForm({ ...form, workingStart: e.target.value })}
              required
            />
          </Field>
          <Field label="Close at">
            <Input
              type="time"
              value={form.workingEnd}
              onChange={(e) => setForm({ ...form, workingEnd: e.target.value })}
              required
            />
          </Field>
          <Field label="Closed weekday">
            <Select
              value={form.closedDay}
              onChange={(e) =>
                setForm({ ...form, closedDay: e.target.value as (typeof WEEKDAYS)[number] })
              }
            >
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <PrimaryButton type="submit" pending={pending}>
          Save hours
        </PrimaryButton>
        {msg && <Toast msg={msg.text} kind={msg.kind} />}
      </form>
    </FormCard>
  );
}
