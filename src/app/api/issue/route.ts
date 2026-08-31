import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  sendEmail,
  issueConfirmationEmail,
  adminIssueEmail,
  ADMIN_EMAIL,
} from "@/lib/email";
import type { IssueBody, Pass } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: IssueBody;
  try {
    body = (await req.json()) as IssueBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const passId = String(body.passId || "").trim();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const type = body.type;

  if (!passId || !name || !email.includes("@")) {
    return NextResponse.json(
      { error: "passId, name and a valid email are required." },
      { status: 400 }
    );
  }
  if (type !== "regular" && type !== "occasional") {
    return NextResponse.json(
      { error: "type must be 'regular' or 'occasional'." },
      { status: 400 }
    );
  }

  // Verify the pass exists and is available.
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("passes")
    .select("*")
    .eq("id", passId)
    .maybeSingle<Pass>();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: `Pass ${passId} not found.` }, { status: 404 });
  }
  if (existing.status !== "available") {
    return NextResponse.json(
      { error: `Pass ${passId} is already checked out.` },
      { status: 409 }
    );
  }

  const issuedAt = new Date().toISOString();

  // Conditional update guards against a race: only flips if still available.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("passes")
    .update({
      status: "out",
      holder_name: name,
      holder_email: email,
      holder_type: type,
      issued_at: issuedAt,
      reminder_count: 0,
      last_reminded_at: null,
    })
    .eq("id", passId)
    .eq("status", "available")
    .select("*")
    .maybeSingle<Pass>();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: `Pass ${passId} was just taken by someone else.` },
      { status: 409 }
    );
  }

  const { error: txErr } = await supabaseAdmin.from("transactions").insert({
    pass_id: passId,
    action: "issued",
    holder_name: name,
    holder_email: email,
    holder_type: type,
    issued_at: issuedAt,
  });
  if (txErr) {
    // The pass is already flipped; log but don't fail the user's request.
    console.error("[issue] failed to log transaction:", txErr);
  }

  console.log(`[issue] pass ${passId} flipped to "out" — sending emails…`);

  const confirmation = issueConfirmationEmail({ name, passId, issuedAt });
  console.log(`[issue] before employee confirmation email → ${email}`);
  const employeeResult = await sendEmail({ to: email, ...confirmation });
  console.log(
    `[issue] after employee confirmation email →`,
    JSON.stringify(employeeResult)
  );

  let adminResult: unknown = { skipped: "ADMIN_EMAIL not set" };
  if (ADMIN_EMAIL) {
    const adminMsg = adminIssueEmail({ name, email, passId, type, issuedAt });
    console.log(`[issue] before admin notification email → ${ADMIN_EMAIL}`);
    adminResult = await sendEmail({ to: ADMIN_EMAIL, ...adminMsg });
    console.log(
      `[issue] after admin notification email →`,
      JSON.stringify(adminResult)
    );
  } else {
    console.warn("[issue] ADMIN_EMAIL is not set — skipping admin notification");
  }

  return NextResponse.json({
    pass: updated,
    emails: { employee: employeeResult, admin: adminResult },
  });
}
