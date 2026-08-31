import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  sendEmail,
  reminderEmail,
  escalationEmail,
  ADMIN_EMAIL,
} from "@/lib/email";
import { hoursBetween } from "@/lib/time";
import type { Pass } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const cutoff = new Date(now - DAY_MS).toISOString();

  // status = out, occasional, checked out > 24h ago, fewer than 3 reminders.
  const { data, error } = await supabaseAdmin
    .from("passes")
    .select("*")
    .eq("status", "out")
    .eq("holder_type", "occasional")
    .lt("issued_at", cutoff)
    .lt("reminder_count", 3);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data as Pass[]).filter(
    (p) =>
      !p.last_reminded_at ||
      now - new Date(p.last_reminded_at).getTime() >= DAY_MS
  );

  const results: Array<{ passId: string; sent: string }> = [];

  for (const p of due) {
    if (!p.issued_at) continue;
    const hoursOut = hoursBetween(p.issued_at);
    const remindedAt = new Date().toISOString();
    const count = p.reminder_count; // reminders already sent: 0, 1 or 2
    const reminderNumber = count + 1; // this is the Nth reminder

    if (count >= 2) {
      // Final step: escalate to the admin only, stop emailing the employee.
      if (ADMIN_EMAIL) {
        const msg = escalationEmail({
          name: p.holder_name,
          email: p.holder_email,
          passId: p.id,
          hoursOut,
        });
        await sendEmail({ to: ADMIN_EMAIL, ...msg });
      }
      results.push({ passId: p.id, sent: "escalation (admin only)" });
    } else {
      const msg = reminderEmail({
        name: p.holder_name,
        passId: p.id,
        hoursOut,
        reminderNumber,
      });
      const cc = count >= 1 && ADMIN_EMAIL ? ADMIN_EMAIL : undefined;
      if (p.holder_email) {
        await sendEmail({ to: p.holder_email, cc, ...msg });
      }
      results.push({
        passId: p.id,
        sent: cc ? `reminder ${reminderNumber} (cc admin)` : `reminder ${reminderNumber}`,
      });
    }

    await supabaseAdmin
      .from("passes")
      .update({
        reminder_count: count + 1,
        last_reminded_at: remindedAt,
      })
      .eq("id", p.id);

    await supabaseAdmin.from("transactions").insert({
      pass_id: p.id,
      action: "reminded",
      holder_name: p.holder_name,
      holder_email: p.holder_email,
      holder_type: p.holder_type,
      issued_at: p.issued_at,
      duration_hours: hoursOut,
    });
  }

  return NextResponse.json({
    checked: data?.length ?? 0,
    reminded: results.length,
    results,
  });
}
