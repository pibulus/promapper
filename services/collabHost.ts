/**
 * Live-collab host resolution — one source of truth for "where is the collab
 * server", read by the create API, the live route, and the server-push helper.
 *
 * Backend history: this used to be PartyKit. PartyKit's SHARED partykit.dev
 * zone permanently hit Cloudflare's 10,000-custom-domains-per-zone limit
 * (their ceiling across all customers, not ours), so deploys could never
 * succeed. We moved to plain Cloudflare Durable Objects — the primitive
 * PartyKit wraps — under our own account. See workers/collab/.
 *
 * PUBLIC_COLLAB_HOST is the canonical name. The legacy PARTYKIT_* names are
 * still honored so a half-migrated environment keeps working.
 */
export function collabHost(): string {
  return (Deno.env.get("PUBLIC_COLLAB_HOST") ??
    Deno.env.get("COLLAB_HOST") ??
    Deno.env.get("PARTYKIT_HOST") ??
    Deno.env.get("PUBLIC_PARTYKIT_HOST") ?? "").trim();
}
