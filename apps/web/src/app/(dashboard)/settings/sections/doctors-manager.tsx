"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import type { Doctor } from "@lavora/db";

import { addDoctor, deleteDoctor, updateDoctor } from "../actions";
import {
  Field,
  FormCard,
  GhostButton,
  Input,
  PrimaryButton,
  Toast,
} from "./form-primitives";

const SPECIALTY_OPTIONS = [
  "dermatology",
  "aesthetics",
  "regenerative",
  "gynecology",
  "slimming",
  "laser_hair_removal",
];

interface DoctorForm {
  name: string;
  nameAr: string;
  title: string;
  specialties: string[];
}

const empty: DoctorForm = { name: "", nameAr: "", title: "", specialties: [] };

export function DoctorsManager({ doctors }: { doctors: Doctor[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<DoctorForm>(empty);

  function startEdit(d: Doctor) {
    setEditingId(d.id);
    setCreating(false);
    setForm({
      name: d.name,
      nameAr: d.nameAr ?? "",
      title: d.title ?? "",
      specialties: d.specialties,
    });
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setForm(empty);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setForm(empty);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      try {
        const payload = {
          name: form.name,
          nameAr: form.nameAr || null,
          title: form.title || null,
          specialties: form.specialties,
        };
        if (editingId) await updateDoctor(editingId, payload);
        else await addDoctor(payload);
        cancel();
        setMsg({ kind: "ok", text: editingId ? "Doctor updated." : "Doctor added." });
      } catch (err: any) {
        setMsg({ kind: "err", text: err?.message ?? "Save failed." });
      }
    });
  }

  function remove(d: Doctor) {
    if (!confirm(`Deactivate ${d.name}? Existing appointments stay; future bookings won't be assignable.`)) return;
    setMsg(null);
    start(async () => {
      try {
        await deleteDoctor(d.id);
        setMsg({ kind: "ok", text: "Doctor deactivated." });
      } catch (err: any) {
        setMsg({ kind: "err", text: err?.message ?? "Remove failed." });
      }
    });
  }

  function toggleSpecialty(s: string) {
    setForm((f) => ({
      ...f,
      specialties: f.specialties.includes(s)
        ? f.specialties.filter((x) => x !== s)
        : [...f.specialties, s],
    }));
  }

  return (
    <FormCard
      title={`Doctors (${doctors.length})`}
      description="The agent picks doctors from this list when callers don't specify one."
    >
      {(creating || editingId) ? (
        <form onSubmit={submit} className="border border-brand-200 rounded-xl p-4 mb-4 bg-brand-50/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field label="Name (English)">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dr. Neda"
              />
            </Field>
            <Field label="Name (Arabic)">
              <Input
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                dir="rtl"
                placeholder="الدكتورة ندى"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Dermatology & Cosmetic Specialist"
                />
              </Field>
            </div>
          </div>
          <div className="mb-4">
            <span className="text-xs font-medium text-neutral-700 mb-2 block">Specialties</span>
            <div className="flex flex-wrap gap-2">
              {SPECIALTY_OPTIONS.map((s) => {
                const on = form.specialties.includes(s);
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggleSpecialty(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition capitalize ${
                      on
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-neutral-600 border-neutral-200 hover:border-brand-300"
                    }`}
                  >
                    {s.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <PrimaryButton type="submit" pending={pending}>
              {editingId ? "Save doctor" : "Add doctor"}
            </PrimaryButton>
            <GhostButton type="button" onClick={cancel} disabled={pending}>
              Cancel
            </GhostButton>
          </div>
        </form>
      ) : (
        <GhostButton type="button" onClick={startCreate} className="mb-4">
          <Plus className="w-3.5 h-3.5" /> Add doctor
        </GhostButton>
      )}

      <ul className="divide-y divide-brand-100/60 -mx-2">
        {doctors.map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-3 py-3 px-2">
            <div>
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
            </div>
            <div className="flex gap-1 shrink-0">
              <GhostButton
                type="button"
                onClick={() => startEdit(d)}
                disabled={pending}
                className="!px-2 !py-1"
                aria-label="Edit doctor"
              >
                <Pencil className="w-3.5 h-3.5" />
              </GhostButton>
              <GhostButton
                type="button"
                onClick={() => remove(d)}
                disabled={pending}
                className="!px-2 !py-1 text-rose-700 hover:!border-rose-300 hover:!text-rose-800"
                aria-label="Deactivate doctor"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </GhostButton>
            </div>
          </li>
        ))}
      </ul>

      {msg && <Toast msg={msg.text} kind={msg.kind} />}
    </FormCard>
  );
}
