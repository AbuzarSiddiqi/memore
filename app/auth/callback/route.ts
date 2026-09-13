import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const isLocalEnv = process.env.NODE_ENV === "development";
        const forwardedHost = request.headers.get("x-forwarded-host");
        const targetUrl = isLocalEnv ? `${origin}${next}` : forwardedHost ? `https://${forwardedHost}${next}` : `${origin}${next}`;
        const res = NextResponse.redirect(targetUrl);
        res.cookies.set("logged_out", "", { path: "/", maxAge: 0 });
        return res;
      }
    }
  }

  // Return the user to an error page or login with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate with Google`);
}
