/** Parse an ISO date to epoch ms, treating missing/invalid values as 0. */
export function ts(value: string | undefined): number {
  const t = new Date(value ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}
