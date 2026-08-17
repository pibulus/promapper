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

/**
 * The shared secret the app presents when pushing snapshots to a room. Same
 * alias story as the host, and for a sharper reason: CLAUDE.md tells you to
 * set COLLAB_UPDATE_TOKEN while the push helper only ever read
 * PARTYKIT_UPDATE_TOKEN. Following the docs therefore left the app sending no
 * token at all, the worker answering 403, and "Go Live" failing with
 * "Could not create live room" — with both names looking correctly set.
 */
export function collabUpdateToken(): string {
  return (Deno.env.get("COLLAB_UPDATE_TOKEN") ??
    Deno.env.get("PARTYKIT_UPDATE_TOKEN") ?? "").trim();
}
