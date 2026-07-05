/** Parse an ISO date to epoch ms, treating missing/invalid values as 0. */
export function ts(value: string | undefined): number {
  const t = new Date(value ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Local YYYY-MM-DD for today + offsetDays (no UTC shift). */
export function localDateISO(offsetDays: number): string {
  const now = new Date();
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetDays,
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}
