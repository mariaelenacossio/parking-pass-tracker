import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendEmail, returnConfirmationEmail } from "@/lib/email";
import { hoursBetween } from "@/lib/time";
import type { Pass, ReturnBody, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: ReturnBody;
  try {
    body = (await req.json()) as ReturnBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const passId = String(body.passId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();

  if (!passId || !email.includes("@")) {
    return NextResponse.json(
      { error: "passId and a valid email are required." },
      { status: 400 }
    );
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
      { error: `Pass ${passId} is not currently checked out.` },
      { status: 409 }
    );
  }
  if ((pass.holder_email || "").toLowerCase() !== email) {
    return NextResponse.json(
      { error: "Email doesn't match our records for this pass." },
      { status: 403 }
    );
  }

  const returnedAt = new Date().toISOString();
  const durationHours = pass.issued_at
    ? hoursBetween(pass.issued_at, returnedAt)
    : null;
  const holderName = pass.holder_name;

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
    .eq("status", "out")
    .select("*")
    .maybeSingle<Pass>();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: `Pass ${passId} was already returned.` },
      { status: 409 }
    );
  }

  // Close out the open "issued" transaction for this pass, if there is one.
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

  // Always log a discrete "returned" row so the history reads cleanly.
  await supabaseAdmin.from("transactions").insert({
    pass_id: passId,
    action: "returned",
    holder_name: holderName,
    holder_email: email,
    holder_type: pass.holder_type,
    issued_at: pass.issued_at,
    returned_at: returnedAt,
    duration_hours: durationHours,
  });

  const confirmation = returnConfirmationEmail({
    name: holderName,
    passId,
    returnedAt,
  });
  await sendEmail({ to: email, ...confirmation });

  return NextResponse.json({ pass: updated });
}
