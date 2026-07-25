-- Expired shares were unreadable (the select RLS policy filters on
-- expires_at > now()) but never deleted, so the table grew forever. Shares
-- are anonymous — no user to key a scheduled cleanup on — so the app
-- opportunistically deletes expired rows on each share create instead of
-- running cron infra. This policy scopes that delete to rows already past
-- expiry: nobody can delete a live share, anyone may reap a dead one.
create policy "Anyone can delete expired shares"
  on conversation_shares
  for delete
  using (expires_at < now());
