import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(req: NextRequest) {
  return updateSession(req);
}

export const config = {
  matcher: [
    // Skip Next internals and any file with an extension (assets).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
