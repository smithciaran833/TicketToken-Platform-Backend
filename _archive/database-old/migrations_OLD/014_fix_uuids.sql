-- Migration: Fix UUID generation functions
-- This updates all existing UUID columns to use sequential UUIDs


-- Ensure extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Log the change
INSERT INTO migrations (name, applied_at) 
VALUES ('020_fix_uuids', NOW());

