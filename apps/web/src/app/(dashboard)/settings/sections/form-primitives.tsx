"use client";

/**
 * Tiny set of form-input primitives shared across the settings sections.
 * Tailwind-only, no form library — every section is a small enough form
 * that useState + the server action is plenty.
 */

import { type ReactNode } from "react";

export function FormCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500">{title}</h2>
        {description && (
          <p className="text-xs text-neutral-400 mt-1">{description}</p>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-brand-100 p-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-medium text-neutral-700 mb-1 block">{label}</span>
      {children}
      {hint && <span className="text-xs text-neutral-400 mt-1 block">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 ${
        props.className ?? ""
      }`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 ${
        props.className ?? ""
      }`}
    />
  );
}

export function PrimaryButton({
  pending,
  children,
  ...rest
}: { pending?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={pending || rest.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 transition disabled:opacity-50 ${
        rest.className ?? ""
      }`}
    >
      {pending ? "Saving..." : children}
    </button>
  );
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 hover:border-brand-300 hover:text-brand-700 text-sm px-4 py-2 transition ${
        props.className ?? ""
      }`}
    />
  );
}

export function Toast({ msg, kind }: { msg: string; kind: "ok" | "err" }) {
  if (!msg) return null;
  const cls =
    kind === "ok"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-rose-50 text-rose-800 border-rose-200";
  return (
    <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${cls}`}>{msg}</div>
  );
}
