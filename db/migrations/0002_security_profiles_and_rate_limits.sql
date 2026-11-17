ALTER TABLE IF EXISTS designer_profiles
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility jsonb NOT NULL DEFAULT '{"bio":true,"skills":true,"socialLinks":true,"posts":true,"portfolio":true}'::jsonb;

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, created_at);

INSERT INTO storage.buckets (id, name, public)
VALUES ('buildex-quarantine', 'buildex-quarantine', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION buildex_replace_jpg_paths(input_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result_value jsonb;
  string_value text;
BEGIN
  CASE jsonb_typeof(input_value)
    WHEN 'string' THEN
      string_value := input_value #>> '{}';
      IF string_value LIKE '%/media/stock/%.jpg'
        OR string_value LIKE '%/images/hero-studio.jpg'
        OR string_value LIKE '%/images/og.jpg'
        OR string_value LIKE '%/brand/mark.jpg' THEN
        RETURN to_jsonb(replace(string_value, '.jpg', '.png'));
      END IF;
      RETURN input_value;
    WHEN 'array' THEN
      SELECT COALESCE(jsonb_agg(buildex_replace_jpg_paths(value)), '[]'::jsonb)
      INTO result_value
      FROM jsonb_array_elements(input_value) AS items(value);
      RETURN result_value;
    WHEN 'object' THEN
      SELECT COALESCE(jsonb_object_agg(key, buildex_replace_jpg_paths(value)), '{}'::jsonb)
      INTO result_value
      FROM jsonb_each(input_value) AS items(key, value);
      RETURN result_value;
    ELSE
      RETURN input_value;
  END CASE;
END;
$$;

UPDATE designer_profiles
SET cover_url = replace(cover_url, '.jpg', '.png')
WHERE cover_url IN ('/images/hero-studio.jpg', '/images/og.jpg', '/brand/mark.jpg')
   OR cover_url LIKE '/media/stock/%.jpg';

UPDATE designer_posts
SET image_url = replace(image_url, '.jpg', '.png')
WHERE image_url IN ('/images/hero-studio.jpg', '/images/og.jpg', '/brand/mark.jpg')
   OR image_url LIKE '/media/stock/%.jpg';

UPDATE templates
SET preview_image = replace(preview_image, '.jpg', '.png')
WHERE preview_image IN ('/images/hero-studio.jpg', '/images/og.jpg', '/brand/mark.jpg')
   OR preview_image LIKE '/media/stock/%.jpg';

UPDATE templates
SET images = buildex_replace_jpg_paths(images),
    document = buildex_replace_jpg_paths(document),
    pending_document = CASE WHEN pending_document IS NULL THEN NULL ELSE buildex_replace_jpg_paths(pending_document) END;

UPDATE websites
SET document = buildex_replace_jpg_paths(document),
    published_document = CASE WHEN published_document IS NULL THEN NULL ELSE buildex_replace_jpg_paths(published_document) END,
    og_image = CASE
      WHEN og_image IN ('/images/hero-studio.jpg', '/images/og.jpg', '/brand/mark.jpg') OR og_image LIKE '/media/stock/%.jpg'
      THEN replace(og_image, '.jpg', '.png')
      ELSE og_image
    END
WHERE document IS NOT NULL;

DROP FUNCTION buildex_replace_jpg_paths(jsonb);
