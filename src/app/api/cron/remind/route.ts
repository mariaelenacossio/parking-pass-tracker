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
  console.log("[cron/remind] start", {
    hasCronSecretEnv: Boolean(process.env.CRON_SECRET),
    hasAuthHeader: Boolean(req.headers.get("authorization")),
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
    hasAdminEmail: Boolean(ADMIN_EMAIL),
  });

  if (!authorized(req)) {
    console.warn("[cron/remind] step 1: unauthorized — returning 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log("[cron/remind] step 1: authorized");

  try {
    const now = Date.now();
    const cutoff = new Date(now - DAY_MS).toISOString();

    // status = out, occasional, checked out > 24h ago, fewer than 3 reminders.
    // First touch of supabaseAdmin builds the client; it throws here if the
    // Supabase env vars are missing.
    console.log(`[cron/remind] step 2: querying passes (issued_at < ${cutoff})`);
    const { data, error } = await supabaseAdmin
      .from("passes")
      .select("*")
      .eq("status", "out")
      .eq("holder_type", "occasional")
      .lt("issued_at", cutoff)
      .lt("reminder_count", 3);

    if (error) {
      console.error("[cron/remind] step 2: Supabase query failed:", JSON.stringify(error));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.log(`[cron/remind] step 2: query ok — ${data?.length ?? 0} candidate pass(es)`);

    const due = (data as Pass[]).filter(
      (p) =>
        !p.last_reminded_at ||
        now - new Date(p.last_reminded_at).getTime() >= DAY_MS
    );
    console.log(
      `[cron/remind] step 3: ${due.length} pass(es) due`,
      due.map((p) => `${p.id}(count=${p.reminder_count})`)
    );

    const results: Array<{ passId: string; sent: string }> = [];

    for (const p of due) {
      if (!p.issued_at) {
        console.warn(`[cron/remind] pass ${p.id}: no issued_at — skipping`);
        continue;
      }
      const hoursOut = hoursBetween(p.issued_at);
      const remindedAt = new Date().toISOString();
      const count = p.reminder_count; // reminders already sent: 0, 1 or 2
      const reminderNumber = count + 1; // this is the Nth reminder

      if (count >= 2) {
        // Final step: escalate to the admin only, stop emailing the employee.
        console.log(`[cron/remind] pass ${p.id}: step 4: escalation to admin`);
        if (ADMIN_EMAIL) {
          const msg = escalationEmail({
            name: p.holder_name,
            email: p.holder_email,
            passId: p.id,
            hoursOut,
          });
          await sendEmail({ to: ADMIN_EMAIL, ...msg });
        } else {
          console.warn(`[cron/remind] pass ${p.id}: ADMIN_EMAIL not set — no escalation sent`);
        }
        results.push({ passId: p.id, sent: "escalation (admin only)" });
      } else {
        console.log(`[cron/remind] pass ${p.id}: step 4: reminder ${reminderNumber}`);
        const msg = reminderEmail({
          name: p.holder_name,
          passId: p.id,
          hoursOut,
          reminderNumber,
        });
        const cc = count >= 1 && ADMIN_EMAIL ? ADMIN_EMAIL : undefined;
        if (p.holder_email) {
          await sendEmail({ to: p.holder_email, cc, ...msg });
        } else {
          console.warn(`[cron/remind] pass ${p.id}: no holder_email — no reminder sent`);
        }
        results.push({
          passId: p.id,
          sent: cc ? `reminder ${reminderNumber} (cc admin)` : `reminder ${reminderNumber}`,
        });
      }

      console.log(`[cron/remind] pass ${p.id}: step 5: updating reminder_count -> ${count + 1}`);
      const { error: updateErr } = await supabaseAdmin
        .from("passes")
        .update({
          reminder_count: count + 1,
          last_reminded_at: remindedAt,
        })
        .eq("id", p.id);
      if (updateErr) {
        console.error(`[cron/remind] pass ${p.id}: step 5 update failed:`, JSON.stringify(updateErr));
      }

      console.log(`[cron/remind] pass ${p.id}: step 6: logging transaction`);
      const { error: txErr } = await supabaseAdmin.from("transactions").insert({
        pass_id: p.id,
        action: "reminded",
        holder_name: p.holder_name,
        holder_email: p.holder_email,
        holder_type: p.holder_type,
        issued_at: p.issued_at,
        duration_hours: hoursOut,
      });
      if (txErr) {
        console.error(`[cron/remind] pass ${p.id}: step 6 insert failed:`, JSON.stringify(txErr));
      }
    }

    console.log(`[cron/remind] done — checked ${data?.length ?? 0}, reminded ${results.length}`);
    return NextResponse.json({
      checked: data?.length ?? 0,
      reminded: results.length,
      results,
    });
  } catch (err) {
    // Anything thrown above (missing Supabase env vars, network failure, a bug)
    // lands here, so the Vercel log shows which step it died after.
    console.error(
      "[cron/remind] UNHANDLED ERROR:",
      err instanceof Error ? `${err.name}: ${err.message}` : err
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
