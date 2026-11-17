
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS analytics_event_key_uidx
  ON analytics_events (event_key);

UPDATE websites
SET published_document = NULL
WHERE published_document IS NOT NULL
  AND published_hash IS NOT NULL
  AND draft_hash IS NOT NULL
  AND published_hash = draft_hash;

CREATE INDEX IF NOT EXISTS websites_owner_updated_idx
  ON websites (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS websites_scheduled_due_idx
  ON websites (scheduled_at)
  WHERE status = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS websites_published_expiry_idx
  ON websites (expires_at)
  WHERE status = 'PUBLISHED' AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_active_expiry_idx
  ON subscriptions (current_period_end)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS template_versions_template_created_idx
  ON template_versions (template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS template_purchases_template_created_idx
  ON template_purchases (template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS designer_followers_target_idx
  ON designer_followers (designer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS post_likes_post_idx
  ON post_likes (post_id);

CREATE INDEX IF NOT EXISTS designer_ratings_target_idx
  ON designer_ratings (designer_id);

CREATE INDEX IF NOT EXISTS support_messages_ticket_created_idx
  ON support_messages (ticket_id, created_at);

CREATE INDEX IF NOT EXISTS guestbook_site_element_created_idx
  ON guestbook_entries (website_id, element_id, created_at DESC);

CREATE INDEX IF NOT EXISTS password_resets_expiry_idx
  ON password_resets (expires_at);

CREATE INDEX IF NOT EXISTS webhook_events_created_idx
  ON webhook_events (created_at);

ANALYZE websites;
ANALYZE templates;
ANALYZE analytics_events;
ANALYZE subscriptions;

WITH ranked_website_versions AS (
  SELECT id, row_number() OVER (PARTITION BY website_id ORDER BY created_at DESC) AS position
  FROM website_versions
)
DELETE FROM website_versions
WHERE id IN (SELECT id FROM ranked_website_versions WHERE position > 10);

WITH ranked_template_versions AS (
  SELECT id, row_number() OVER (PARTITION BY template_id ORDER BY created_at DESC) AS position
  FROM template_versions
)
DELETE FROM template_versions tv
WHERE id IN (SELECT id FROM ranked_template_versions WHERE position > 10)
  AND tv.status <> 'PENDING'
  AND NOT EXISTS (SELECT 1 FROM template_reviews tr WHERE tr.version_id = tv.id);

CREATE INDEX IF NOT EXISTS notifications_read_created_idx
  ON notifications (read_at, created_at);

CREATE INDEX IF NOT EXISTS rate_limit_reset_idx
  ON rate_limit_buckets (reset_at);

ANALYZE website_versions;
ANALYZE template_versions;
ANALYZE notifications;
ANALYZE rate_limit_buckets;
