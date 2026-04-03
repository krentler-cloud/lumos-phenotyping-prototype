import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.redirect(
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : "/login"
  );
  response.cookies.delete("lumos-auth");
  return response;
}
