import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

console.log(
  `[email] module init — RESEND_API_KEY ${
    apiKey ? `present (${apiKey.slice(0, 6)}…, len ${apiKey.length})` : "MISSING"
  }`
);

const FROM = process.env.EMAIL_FROM || "Parking Passes <onboarding@resend.dev>";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";

interface SendArgs {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
}

/**
 * Thin wrapper around Resend. If RESEND_API_KEY is not configured we log and
 * skip sending so local development and previews don't crash — the rest of the
 * request (DB writes, response) still completes.
 */
export async function sendEmail({ to, cc, subject, html }: SendArgs) {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping "${subject}" to ${String(to)}`
    );
    return { skipped: true as const };
  }
  console.log(
    `[email] → calling Resend  from="${FROM}"  to=${JSON.stringify(to)}` +
      `${cc ? `  cc=${JSON.stringify(cc)}` : ""}  subject="${subject}"`
  );
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      ...(cc ? { cc } : {}),
      subject,
      html,
    });
    if (error) {
      console.error("[email] ✗ Resend returned an error:", JSON.stringify(error));
      return { error };
    }
    console.log("[email] ✓ Resend accepted — id:", data?.id);
    return { data };
  } catch (err) {
    console.error(
      "[email] ✗ Resend call threw:",
      err instanceof Error ? `${err.name}: ${err.message}` : err
    );
    return { error: err };
  }
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------
function layout(body: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:16px;">
        Associa British Columbia · Parking Passes
      </div>
      ${body}
    </div>
    <div style="max-width:480px;margin:12px auto 0;font-size:11px;color:#94a3b8;text-align:center;">
      This is an automated message from the parking pass tracker.
    </div>
  </body>
</html>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;margin-top:8px;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;">${label}</a>`;
}

function fmt(dateIso: string) {
  return new Date(dateIso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Vancouver",
  });
}

function returnLink(passId: string) {
  return `${APP_URL}/?action=return&pass=${passId}`;
}

// ---------------------------------------------------------------------------
// 1. Issue confirmation — to employee
// ---------------------------------------------------------------------------
export function issueConfirmationEmail(args: {
  name: string;
  passId: string;
  issuedAt: string;
}) {
  const { name, passId, issuedAt } = args;
  return {
    subject: `Parking Pass ${passId} checked out`,
    html: layout(`
      <h1 style="font-size:20px;margin:0 0 12px;">Pass ${passId} is checked out to you</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 8px;">Hi ${name},</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
        You checked out <strong>Parking Pass ${passId}</strong> on ${fmt(issuedAt)}.
        Please return it as soon as you're done so someone else can use it.
      </p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 6px;">When you're finished, return it here:</p>
      ${button(returnLink(passId), `Return Pass ${passId}`)}
    `),
  };
}

// ---------------------------------------------------------------------------
// 2. Admin issue notification
// ---------------------------------------------------------------------------
export function adminIssueEmail(args: {
  name: string;
  email: string;
  passId: string;
  type: string;
  issuedAt: string;
}) {
  const { name, email, passId, type, issuedAt } = args;
  return {
    subject: `${name} took Parking Pass ${passId}`,
    html: layout(`
      <h1 style="font-size:18px;margin:0 0 12px;">Pass ${passId} checked out</h1>
      <table style="font-size:14px;line-height:1.8;border-collapse:collapse;">
        <tr><td style="color:#64748b;padding-right:16px;">Name</td><td>${name}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px;">Email</td><td>${email}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px;">Pass</td><td>${passId}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px;">Type</td><td>${type}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px;">Time</td><td>${fmt(issuedAt)}</td></tr>
      </table>
      <p style="font-size:13px;color:#94a3b8;margin:16px 0 0;">No action needed.</p>
    `),
  };
}

// ---------------------------------------------------------------------------
// 3. Return confirmation — to employee
// ---------------------------------------------------------------------------
export function returnConfirmationEmail(args: {
  name: string | null;
  passId: string;
  returnedAt: string;
}) {
  const { name, passId, returnedAt } = args;
  const first = name ? name.split(" ")[0] : "there";
  return {
    subject: `Parking Pass ${passId} returned — thanks`,
    html: layout(`
      <h1 style="font-size:20px;margin:0 0 12px;">Pass ${passId} is back in</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 8px;">Thanks ${first}!</p>
      <p style="font-size:14px;line-height:1.6;margin:0;">
        We logged <strong>Parking Pass ${passId}</strong> as returned on ${fmt(returnedAt)}.
        Nothing else to do.
      </p>
    `),
  };
}

// ---------------------------------------------------------------------------
// 4. Reminder — to employee (CC admin on 2nd send)
// ---------------------------------------------------------------------------
export function reminderEmail(args: {
  name: string | null;
  passId: string;
  hoursOut: number;
  reminderNumber: number; // 1-based: 1st reminder, 2nd reminder, ...
}) {
  const { name, passId, hoursOut, reminderNumber } = args;
  const first = name ? name.split(" ")[0] : "there";
  const days = Math.floor(hoursOut / 24);
  const outFor =
    days >= 1
      ? `${days} day${days === 1 ? "" : "s"} (${Math.round(hoursOut)} hours)`
      : `${Math.round(hoursOut)} hours`;

  const firm =
    reminderNumber >= 2
      ? `This is reminder ${reminderNumber}. Please return the pass today — your manager has been copied on this message.`
      : `Just a friendly nudge — please return the pass when you get a chance.`;

  return {
    subject: `Reminder: Parking Pass ${passId} is still checked out`,
    html: layout(`
      <h1 style="font-size:20px;margin:0 0 12px;">Parking Pass ${passId} is still out</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 8px;">Hi ${first},</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
        Our records show <strong>Pass ${passId}</strong> has been checked out to you
        for ${outFor}. ${firm}
      </p>
      ${button(returnLink(passId), `Return Pass ${passId}`)}
    `),
  };
}

// ---------------------------------------------------------------------------
// 5. Escalation — admin only, after the final reminder
// ---------------------------------------------------------------------------
export function escalationEmail(args: {
  name: string | null;
  email: string | null;
  passId: string;
  hoursOut: number;
}) {
  const { name, email, passId, hoursOut } = args;
  const days = Math.floor(hoursOut / 24);
  return {
    subject: `Action needed — Pass ${passId} unreturned for ${days}+ days`,
    html: layout(`
      <h1 style="font-size:18px;margin:0 0 12px;">Pass ${passId} has not been returned</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
        ${name || "The holder"} has received the maximum number of reminders and
        the pass is still checked out. No further emails will be sent to them —
        please follow up directly.
      </p>
      <table style="font-size:14px;line-height:1.8;border-collapse:collapse;">
        <tr><td style="color:#64748b;padding-right:16px;">Name</td><td>${name || "—"}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px;">Email</td><td>${email || "—"}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px;">Pass</td><td>${passId}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px;">Total time out</td><td>${Math.round(hoursOut)} hours</td></tr>
      </table>
    `),
  };
}

export { ADMIN_EMAIL };
