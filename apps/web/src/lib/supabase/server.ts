/**
 * Server-side Supabase client.
 *
 * Used inside server components, server actions, and route handlers.
 * Reads + writes the auth cookie via Next's cookies() helper so the
 * session survives across requests.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase env vars missing — check NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.");
  }
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — middleware will refresh.
        }
      },
    },
  });
}
