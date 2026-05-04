"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/appointments";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    const supabase = getSupabaseBrowser();
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Account created. Check your email if confirmation is required, then sign in.");
        setMode("in");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-4xl text-brand-700 mb-2">Lavora</h1>
          <p className="text-sm text-neutral-500">Where Science, Beauty, and Longevity Meet</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-8">
          <h2 className="text-xl font-medium mb-6 text-neutral-800">
            {mode === "in" ? "Sign in to your dashboard" : "Create an account"}
          </h2>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Password</label>
              <input
                type="password"
                required
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            {err && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {err}
              </div>
            )}
            {info && (
              <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 transition disabled:opacity-50"
            >
              {busy ? "..." : mode === "in" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setErr(null);
              setInfo(null);
            }}
            className="mt-6 w-full text-sm text-neutral-500 hover:text-brand-700"
          >
            {mode === "in" ? "Need an account? Create one →" : "Already have an account? Sign in →"}
          </button>
        </div>
      </div>
    </main>
  );
}
