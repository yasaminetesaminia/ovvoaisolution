"use client";

/**
 * Live indicator + auto-refresh on incoming activity.
 *
 * Subscribes to the `calls` and `appointments` tables via Supabase
 * Realtime. When something INSERTS or UPDATES, we:
 *   - flash the badge to "LIVE"
 *   - call router.refresh() so server components re-render with fresh
 *     data (no SWR / client cache drift to debug)
 *
 * router.refresh() only re-fetches on-screen RSCs — it doesn't reload
 * the page, so scroll position and form state survive. Cheap.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export function LiveBadge({ initialActive = false }: { initialActive?: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [pulses, setPulses] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let channel: RealtimeChannel | null = null;
    // Re-render schedule throttle: refresh at most every 2s so a burst
    // of webhooks doesn't flood the server with re-render requests.
    let pendingRefresh: ReturnType<typeof setTimeout> | null = null;

    function onChange() {
      setActive(true);
      setPulses((p) => p + 1);
      if (pendingRefresh) return;
      pendingRefresh = setTimeout(() => {
        router.refresh();
        pendingRefresh = null;
      }, 2000);
    }

    channel = supabase
      .channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, onChange)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        onChange,
      )
      .subscribe();

    // Drop the active flag back to neutral after 30s of quiet so we
    // don't permanently say "LIVE" because of one historical event.
    const idle = setInterval(() => setActive(false), 30_000);

    return () => {
      if (pendingRefresh) clearTimeout(pendingRefresh);
      clearInterval(idle);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-neutral-50 text-neutral-500 border-neutral-200"
      }`}
      title={`${pulses} live updates this session`}
    >
      <span className="relative flex w-2 h-2">
        {active && (
          <span className="animate-ping absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex w-2 h-2 rounded-full ${
            active ? "bg-rose-500" : "bg-neutral-300"
          }`}
        />
      </span>
      {active ? "LIVE" : "Live updates on"}
    </div>
  );
}
