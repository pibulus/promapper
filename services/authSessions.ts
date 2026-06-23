const SESSION_TTL_MS = Number(
  Deno.env.get("API_SESSION_TTL_MS") ?? `${4 * 60 * 60 * 1000}`,
);

const sessions = new Map<string, number>();

// Amortized sweep: validateSession runs on every guarded request (frequent),
// but cleanupExpired only ran on createSession (login — rare). Under
// validation-heavy traffic, expired sessions for ids never re-presented would
// otherwise linger. Sweep every Nth validation so the cost is amortized to ~O(1)
// per call. Deterministic counter (no Math.random — banned in this runtime).
const SWEEP_EVERY = 100;
let validateCount = 0;

export function createSession(): string {
  cleanupExpired();
  const id = crypto.randomUUID();
  sessions.set(id, Date.now() + SESSION_TTL_MS);
  return id;
}

export function validateSession(id: string | undefined | null): boolean {
  if (++validateCount % SWEEP_EVERY === 0) cleanupExpired();
  if (!id) return false;
  const expiry = sessions.get(id);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    sessions.delete(id);
    return false;
  }
  return true;
}

export function deleteSession(id: string | undefined | null) {
  if (!id) return;
  sessions.delete(id);
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, expiry] of sessions.entries()) {
    if (expiry < now) {
      sessions.delete(id);
    }
  }
}
