import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Railway (and most reverse proxies) pass the real public hostname in
  // x-forwarded-host. req.nextUrl.origin resolves to the internal
  // container address (localhost:8080), so we can't use it directly.
  const forwarded = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const explicitBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  const base = explicitBase ?? (forwarded ? `${proto}://${forwarded}` : req.nextUrl.origin);

  const response = NextResponse.redirect(`${base}/login`);
  response.cookies.delete("lumos-auth");
  return response;
}
