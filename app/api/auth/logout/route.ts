import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Derive origin from the incoming request so this works on any host
  // (Railway, localhost, custom domain) without needing NEXT_PUBLIC_APP_URL set.
  const origin = req.nextUrl.origin;
  const response = NextResponse.redirect(`${origin}/login`);
  response.cookies.delete("lumos-auth");
  return response;
}
