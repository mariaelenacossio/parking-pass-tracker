/** Whole-ish hours between two instants, rounded to 1 decimal. */
export function hoursBetween(fromIso: string, toIso: string | Date = new Date()) {
  const from = new Date(fromIso).getTime();
  const to = toIso instanceof Date ? toIso.getTime() : new Date(toIso).getTime();
  return Math.round(((to - from) / 3_600_000) * 10) / 10;
}
