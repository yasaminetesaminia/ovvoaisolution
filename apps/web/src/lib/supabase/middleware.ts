/**
 * Auth-refresh middleware. Runs on every request to keep the Supabase
 * session cookie fresh; otherwise the user gets logged out after the
 * access token's short TTL even with a valid refresh token.
 *
 * Also redirects unauthenticated users away from protected pages.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function updateSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          for (const { name, value, options } of cookiesToSet) {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return res;
}
