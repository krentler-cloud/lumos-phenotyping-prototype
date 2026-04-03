import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password, next } = await req.json();
  const expected = process.env.PROTO_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const redirectTo = next && next.startsWith("/") ? next : "/";
  const response = NextResponse.json({ ok: true, redirect: redirectTo });

  response.cookies.set("lumos-auth", password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 14, // 14 days
    path: "/",
  });

  return response;
}
