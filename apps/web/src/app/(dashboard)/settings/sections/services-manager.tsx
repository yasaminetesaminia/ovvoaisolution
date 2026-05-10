"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";

import type { Service } from "@lavora/db";

import { toggleServiceActive, updateService } from "../actions";
import {
  Field,
  FormCard,
  GhostButton,
  Input,
  PrimaryButton,
  Toast,
} from "./form-primitives";

const DEPT_LABEL: Record<string, string> = {
  dermatology: "Dermatology & Skin Care",
  aesthetics: "Non-Surgical Aesthetics",
  regenerative: "Regenerative & Cellular Therapies",
  slimming: "Body Slimming",
  gynecology: "Aesthetic Gynecology",
  laser_hair_removal: "Laser Hair Removal",
};

interface EditState {
  nameEn: string;
  nameAr: string;
  durationMinutes: number;
  priceOmr: string; // text so the empty case is clean
  priceUnit: string;
  capacity: number;
  isActive: boolean;
}

export function ServicesManager({ services }: { services: Service[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState | null>(null);

  function startEdit(s: Service) {
    setEditingId(s.id);
    setForm({
      nameEn: s.nameEn,
      nameAr: s.nameAr ?? "",
      durationMinutes: s.durationMinutes,
      priceOmr: s.priceMinor != null ? (s.priceMinor / 1000).toString() : "",
      priceUnit: s.priceUnit ?? "",
      capacity: s.capacity,
      isActive: s.isActive,
    });
  }

  function cancel() {
    setEditingId(null);
    setForm(null);
  }

  function submit(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!form) return;
    setMsg(null);
    start(async () => {
      try {
        await updateService(id, {
          nameEn: form.nameEn,
          nameAr: form.nameAr || null,
          durationMinutes: form.durationMinutes,
          priceMinor: form.priceOmr === "" ? null : Math.round(Number(form.priceOmr) * 1000),
          priceUnit: form.priceUnit || null,
          capacity: form.capacity,
          isActive: form.isActive,
        });
        cancel();
        setMsg({ kind: "ok", text: "Service updated." });
      } catch (err: any) {
        setMsg({ kind: "err", text: err?.message ?? "Save failed." });
      }
    });
  }

  function quickToggle(s: Service) {
    setMsg(null);
    start(async () => {
      try {
        await toggleServiceActive(s.id, !s.isActive);
      } catch (err: any) {
        setMsg({ kind: "err", text: err?.message ?? "Toggle failed." });
      }
    });
  }

  // Group services by department once for display.
  const byDept = services.reduce<Record<string, Service[]>>((acc, s) => {
    (acc[s.department] ??= []).push(s);
    return acc;
  }, {});

  return (
    <FormCard
      title={`Service catalog (${services.length})`}
      description="Edit prices, durations, and toggle which services are bookable. The agent re-reads this on every call — changes are live."
    >
      {Object.entries(byDept).map(([dept, list]) => (
        <div key={dept} className="mb-6 last:mb-0">
          <h3 className="text-sm font-medium text-neutral-700 mb-2">
            {DEPT_LABEL[dept] ?? dept}
          </h3>
          <ul className="divide-y divide-brand-100/60 -mx-2">
            {list.map((s) => {
              const isEditing = editingId === s.id;
              if (isEditing && form) {
                return (
                  <li key={s.id} className="px-2 py-3 bg-brand-50/40">
                    <form
                      onSubmit={(e) => submit(e, s.id)}
                      className="grid grid-cols-1 sm:grid-cols-6 gap-3"
                    >
                      <div className="sm:col-span-2">
                        <Field label="Name (EN)">
                          <Input
                            required
                            value={form.nameEn}
                            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Name (AR)">
                          <Input
                            value={form.nameAr}
                            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                            dir="rtl"
                          />
                        </Field>
                      </div>
                      <Field label="Duration (min)">
                        <Input
                          type="number"
                          required
                          min={5}
                          max={480}
                          value={form.durationMinutes}
                          onChange={(e) =>
                            setForm({ ...form, durationMinutes: Number(e.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Capacity">
                        <Input
                          type="number"
                          required
                          min={1}
                          max={20}
                          value={form.capacity}
                          onChange={(e) =>
                            setForm({ ...form, capacity: Number(e.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Price (OMR)">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={form.priceOmr}
                          onChange={(e) => setForm({ ...form, priceOmr: e.target.value })}
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Price unit">
                          <Input
                            value={form.priceUnit}
                            onChange={(e) =>
                              setForm({ ...form, priceUnit: e.target.value })
                            }
                            placeholder="per session / per syringe"
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-3 flex items-end gap-2">
                        <label className="inline-flex items-center gap-2 text-xs text-neutral-700 mr-auto">
                          <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(e) =>
                              setForm({ ...form, isActive: e.target.checked })
                            }
                            className="accent-brand-600"
                          />
                          Active
                        </label>
                        <PrimaryButton type="submit" pending={pending}>
                          Save
                        </PrimaryButton>
                        <GhostButton type="button" onClick={cancel} disabled={pending}>
                          <X className="w-3.5 h-3.5" />
                        </GhostButton>
                      </div>
                    </form>
                  </li>
                );
              }
              return (
                <li
                  key={s.id}
                  className={`flex items-center gap-4 px-2 py-2.5 ${
                    s.isActive ? "" : "opacity-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-800 text-sm">{s.nameEn}</div>
                    <div className="text-xs text-neutral-500" dir="rtl">
                      {s.nameAr ?? ""}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 whitespace-nowrap">
                    {s.durationMinutes} min · cap {s.capacity}
                  </div>
                  <div className="text-sm font-medium text-neutral-800 whitespace-nowrap min-w-[88px] text-right">
                    {s.priceMinor != null ? `${(s.priceMinor / 1000).toFixed(0)} OMR` : "—"}
                    {s.priceUnit && (
                      <div className="text-xs text-neutral-400 font-normal">
                        {s.priceUnit}
                      </div>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s.isActive}
                      onChange={() => quickToggle(s)}
                      disabled={pending}
                      className="accent-brand-600"
                    />
                    <span className="text-xs text-neutral-500">on</span>
                  </label>
                  <GhostButton
                    type="button"
                    onClick={() => startEdit(s)}
                    disabled={pending}
                    className="!px-2 !py-1"
                    aria-label="Edit service"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </GhostButton>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {msg && <Toast msg={msg.text} kind={msg.kind} />}
    </FormCard>
  );
}
