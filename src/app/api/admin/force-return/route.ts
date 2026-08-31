import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-auth";
import { sendEmail, returnConfirmationEmail } from "@/lib/email";
import { hoursBetween } from "@/lib/time";
import type { Pass, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let passId = "";
  try {
    const body = await req.json();
    passId = String(body?.passId || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (!passId) {
    return NextResponse.json({ error: "passId is required." }, { status: 400 });
  }

  const { data: pass, error: readErr } = await supabaseAdmin
    .from("passes")
    .select("*")
    .eq("id", passId)
    .maybeSingle<Pass>();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!pass) {
    return NextResponse.json({ error: `Pass ${passId} not found.` }, { status: 404 });
  }
  if (pass.status !== "out") {
    return NextResponse.json(
      { error: `Pass ${passId} is not checked out.` },
      { status: 409 }
    );
  }

  const returnedAt = new Date().toISOString();
  const durationHours = pass.issued_at
    ? hoursBetween(pass.issued_at, returnedAt)
    : null;
  const lastHolderEmail = pass.holder_email;
  const lastHolderName = pass.holder_name;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("passes")
    .update({
      status: "available",
      holder_name: null,
      holder_email: null,
      holder_type: null,
      issued_at: null,
      reminder_count: 0,
      last_reminded_at: null,
    })
    .eq("id", passId)
    .select("*")
    .maybeSingle<Pass>();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const { data: openTx } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("pass_id", passId)
    .eq("action", "issued")
    .is("returned_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Transaction>();

  if (openTx) {
    await supabaseAdmin
      .from("transactions")
      .update({ returned_at: returnedAt, duration_hours: durationHours })
      .eq("id", openTx.id);
  }

  await supabaseAdmin.from("transactions").insert({
    pass_id: passId,
    action: "returned",
    holder_name: lastHolderName,
    holder_email: lastHolderEmail,
    holder_type: pass.holder_type,
    issued_at: pass.issued_at,
    returned_at: returnedAt,
    duration_hours: durationHours,
  });

  if (lastHolderEmail) {
    const msg = returnConfirmationEmail({
      name: lastHolderName,
      passId,
      returnedAt,
    });
    await sendEmail({ to: lastHolderEmail, ...msg });
  }

  return NextResponse.json({ pass: updated });
}
