"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, LogOut, Phone, Settings, Users } from "lucide-react";

import { getSupabaseBrowser } from "@/lib/supabase/client";

const NAV: Array<{ href: string; label: string; icon: any; ready: boolean }> = [
  { href: "/appointments", label: "Appointments", icon: Calendar, ready: true },
  { href: "/calls", label: "Calls", icon: Phone, ready: true },
  { href: "/clients", label: "Clients", icon: Users, ready: false },
  { href: "/settings", label: "Settings", icon: Settings, ready: false },
];

export function Sidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-brand-100 flex flex-col">
      <div className="px-6 py-6 border-b border-brand-100">
        <div className="font-serif text-2xl text-brand-700 leading-tight">Lavora</div>
        <div className="text-xs text-neutral-400 mt-0.5">Receptionist Dashboard</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const cls = active
            ? "bg-brand-100 text-brand-800"
            : "text-neutral-600 hover:bg-brand-50 hover:text-brand-700";
          if (!item.ready) {
            return (
              <span
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-neutral-300 cursor-not-allowed"
                title="Coming soon"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                <span className="ml-auto text-[10px] uppercase tracking-wider text-neutral-300">soon</span>
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${cls}`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-brand-100 px-4 py-4">
        <div className="text-xs text-neutral-400 mb-2 truncate" title={email ?? ""}>
          {email}
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 text-sm text-neutral-600 hover:text-brand-700 py-2 rounded-lg border border-neutral-200 hover:border-brand-300 transition"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
