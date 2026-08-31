import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-auth";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLUMNS: Array<keyof Transaction> = [
  "id",
  "pass_id",
  "action",
  "holder_name",
  "holder_email",
  "holder_type",
  "issued_at",
  "returned_at",
  "duration_hours",
  "created_at",
];

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  if (!isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as Transaction[]) || [];
  const lines = [
    COLUMNS.join(","),
    ...rows.map((row) => COLUMNS.map((c) => csvCell(row[c])).join(",")),
  ];
  const csv = "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${stamp}.csv"`,
    },
  });
}
