import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_session";

const password = process.env.ADMIN_PASSWORD || "";

/**
 * Deterministic token derived from ADMIN_PASSWORD. Not a real session system —
 * good enough for a single shared admin password per the spec. Changing
 * ADMIN_PASSWORD invalidates every existing cookie.
 */
export function adminToken() {
  return createHmac("sha256", password || "unset")
    .update("parking-pass-tracker:admin")
    .digest("hex");
}

export function passwordMatches(input: string) {
  if (!password) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAdminRequest() {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const expected = adminToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
