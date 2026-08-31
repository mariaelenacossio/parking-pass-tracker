import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { hoursBetween } from "@/lib/time";
import type { Pass, PassWithDuration } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("passes")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const passes: PassWithDuration[] = (data as Pass[]).map((p) => ({
    ...p,
    hours_out:
      p.status === "out" && p.issued_at ? hoursBetween(p.issued_at) : null,
  }));

  return NextResponse.json({ passes });
}
