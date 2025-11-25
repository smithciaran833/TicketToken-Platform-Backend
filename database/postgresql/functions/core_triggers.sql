-- ============================================
-- CORE TRIGGER FUNCTIONS
-- These are used by table migrations across services
-- ============================================

-- Function: Auto-generate referral code for users
CREATE OR REPLACE FUNCTION generate_user_referral_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(md5(random()::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

-- Function: Increment referral count when user verifies email
CREATE OR REPLACE FUNCTION increment_referral_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referred_by IS NOT NULL THEN
    UPDATE users SET referral_count = referral_count + 1 WHERE id = NEW.referred_by;
  END IF;
  RETURN NEW;
END;
$$;

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- Function: Auto-generate venue slug
CREATE OR REPLACE FUNCTION generate_venue_slug() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
    WHILE EXISTS (SELECT 1 FROM venues WHERE slug = NEW.slug AND id != NEW.id) LOOP
      NEW.slug := NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Function: Auto-generate event slug
CREATE OR REPLACE FUNCTION generate_event_slug() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
    NEW.slug := (SELECT slug FROM venues WHERE id = NEW.venue_id) || '-' || NEW.slug;
    WHILE EXISTS (SELECT 1 FROM events WHERE slug = NEW.slug AND id != NEW.id) LOOP
      NEW.slug := NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Function: Create default venue settings
CREATE OR REPLACE FUNCTION create_default_venue_settings() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO venue_settings (venue_id) VALUES (NEW.id) ON CONFLICT (venue_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Function: Create event metadata
CREATE OR REPLACE FUNCTION create_event_metadata() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO event_metadata (event_id, tenant_id) VALUES (NEW.id, NEW.tenant_id) ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END;
$$;
