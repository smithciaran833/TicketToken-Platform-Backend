-- ============================================
-- FIX VENUES MASKED VIEW
-- ============================================
-- This script recreates the venues_masked view
-- using ACTUAL column names from the venues table
--
-- USAGE:
--   PGPASSWORD=postgres psql -h localhost -U postgres -d tickettoken_db -f fix_venues_masked_view.sql
-- ============================================

\echo ''
\echo '=================================================='
\echo 'FIXING VENUES_MASKED VIEW'
\echo '=================================================='
\echo ''

-- Drop existing view if it exists
DROP VIEW IF EXISTS venues_masked CASCADE;

\echo 'Creating venues_masked view with actual columns...'

-- Create view with proper column names
-- Uses address_line1 and address_line2 instead of non-existent 'address'
CREATE VIEW venues_masked AS
SELECT 
  id,
  tenant_id,
  name,
  description,
  -- Mask tax_id: show only last 4 digits
  CASE 
    WHEN tax_id IS NOT NULL AND length(tax_id) > 4 THEN 
      '***-**-' || right(tax_id, 4)
    ELSE 
      '***-**-****'
  END AS tax_id_masked,
  -- Keep address information visible (not sensitive)
  address_line1,
  address_line2,
  city,
  state,
  postal_code,
  country,
  phone,
  email,
  website,
  status,
  capacity,
  venue_type,
  created_by,
  updated_by,
  created_at,
  updated_at
FROM venues;

\echo '✓ venues_masked view created'

-- Grant permissions
GRANT SELECT ON venues_masked TO app_role;
GRANT SELECT ON venues_masked TO readonly_role;

\echo '✓ Permissions granted on venues_masked view'

-- ============================================
-- ALTERNATIVE: Function to decrypt tax_id for authorized users
-- ============================================

\echo ''
\echo 'Creating tax_id decryption helper function...'

-- Function to get full tax_id (admin only)
CREATE OR REPLACE FUNCTION get_venue_tax_id(venue_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
  venue_tax_id TEXT;
BEGIN
  -- Get current user role
  user_role := current_setting('app.current_user_role', true);
  
  -- Only admins and superadmins can decrypt
  IF user_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Insufficient permissions to view tax_id';
  END IF;
  
  -- Get tax_id
  SELECT tax_id INTO venue_tax_id
  FROM venues
  WHERE id = venue_uuid;
  
  RETURN venue_tax_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

\echo '✓ get_venue_tax_id() function created'

-- Grant execute permission to roles that need it
GRANT EXECUTE ON FUNCTION get_venue_tax_id(UUID) TO app_role;

\echo ''
\echo '=================================================='
\echo 'VENUES MASKED VIEW FIXED SUCCESSFULLY'
\echo '=================================================='
\echo ''
\echo 'Usage:'
\echo '  1. Regular users: SELECT * FROM venues_masked;'
\echo '  2. Admins only: SELECT get_venue_tax_id(<venue_id>);'
\echo ''
\echo 'The view now uses actual column names:'
\echo '  - address_line1 (not "address")'
\echo '  - address_line2'
\echo '  - tax_id_masked (shows only last 4 digits)'
\echo ''
