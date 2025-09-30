-- Migration: Add event_tiers view for backward compatibility
-- This maps ticket_types to the expected event_tiers structure

CREATE OR REPLACE VIEW event_tiers AS
SELECT
  tt.id::uuid                     AS id,
  tt.event_id::uuid               AS event_id,
  tt.name                         AS name,
  tt.price_cents::integer         AS price_cents,
  tt.capacity::integer            AS capacity,
  COALESCE(tt.is_transferable, true) AS transferable,
  COALESCE(tt.resale_price_cap_pct, 110)::integer AS resale_cap_pct,
  tt.created_at,
  tt.updated_at
FROM ticket_types tt;

-- Grant permissions
GRANT SELECT ON event_tiers TO PUBLIC;

-- Add comment for documentation
COMMENT ON VIEW event_tiers IS 'Compatibility view mapping ticket_types to legacy event_tiers structure';
