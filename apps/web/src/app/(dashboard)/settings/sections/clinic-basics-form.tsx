"use client";

import { useState, useTransition } from "react";

import type { Clinic } from "@lavora/db";

import { updateClinicBasics } from "../actions";
import {
  Field,
  FormCard,
  Input,
  PrimaryButton,
  Toast,
} from "./form-primitives";

export function ClinicBasicsForm({ clinic }: { clinic: Clinic }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: clinic.name,
    tagline: clinic.tagline ?? "",
    phone: clinic.phone ?? "",
    email: clinic.email ?? "",
    website: clinic.website ?? "",
    addressEn: clinic.addressEn ?? "",
    addressAr: clinic.addressAr ?? "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      try {
        await updateClinicBasics(form);
        setMsg({ kind: "ok", text: "Saved." });
      } catch (err: any) {
        setMsg({ kind: "err", text: err?.message ?? "Save failed." });
      }
    });
  }

  return (
    <FormCard title="Clinic" description="Brand identity shown to callers and on receipts.">
      <form onSubmit={submit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field label="Name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="Where Science, Beauty, and Longevity Meet"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+968 7111 5617"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="info@lavoraclinic.com"
            />
          </Field>
          <Field label="Website">
            <Input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="lavoraclinic.om"
            />
          </Field>
          <div /> {/* spacer to keep address rows full-width below */}
          <div className="sm:col-span-2">
            <Field label="Address (English)">
              <Input
                value={form.addressEn}
                onChange={(e) => setForm({ ...form, addressEn: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address (Arabic)">
              <Input
                value={form.addressAr}
                onChange={(e) => setForm({ ...form, addressAr: e.target.value })}
                dir="rtl"
              />
            </Field>
          </div>
        </div>
        <PrimaryButton type="submit" pending={pending}>
          Save changes
        </PrimaryButton>
        {msg && <Toast msg={msg.text} kind={msg.kind} />}
      </form>
    </FormCard>
  );
}
