import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminToken,
  passwordMatches,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password || "");
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not configured on the server." },
      { status: 500 }
    );
  }

  if (!passwordMatches(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
