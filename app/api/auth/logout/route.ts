import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Prefer the explicit app URL env var (set on Railway).
  // Fall back to deriving from the request origin (local dev).
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    req.nextUrl.origin;

  const response = NextResponse.redirect(`${base}/login`);
  response.cookies.delete("lumos-auth");
  return response;
}
