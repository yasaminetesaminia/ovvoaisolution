/**
 * Browser-side Supabase client. Use inside "use client" components for
 * sign-in / sign-out actions. Reads the same cookies that the server
 * client wrote.
 */

"use client";

import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
