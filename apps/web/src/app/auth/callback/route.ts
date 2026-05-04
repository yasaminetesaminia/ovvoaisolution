/**
 * Supabase email-link / OAuth callback. Exchanges the `code` query
 * param for a session cookie and redirects to ?next or /.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/appointments";

  if (code) {
    const supabase = await getSupabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
