-- Test Data Setup for Event Service Integration Tests
-- Run this before running the test suite

BEGIN;

-- 1. Create test user (if not exists)
INSERT INTO users (
  id, 
  email, 
  password_hash, 
  first_name, 
  last_name, 
  role, 
  email_verified, 
  status,
  created_at, 
  updated_at
)
VALUES (
  '35fd0e42-a3f0-11f0-a02b-00155d9c6820',
  'test@test.com',
  '$2b$10$rQ9YhJzEf5LmxFZvKGZqKO7EKXj3qYJx8K9Y7Z8VqLmNxFPqWZ9sK', -- Password: Test123!@#
  'Test',
  'User',
  'user',
  true,
  'ACTIVE',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- 2. Create test venue (if not exists)
INSERT INTO venues (
  id, 
  name, 
  slug,
  email,
  address_line1,
  city,
  state_province,
  country_code,
  venue_type,
  max_capacity,
  status,
  created_at,
  updated_at
)
VALUES (
  '7025024b-7dab-4e9a-87d9-ea83caf1dc06',
  'Test Venue',
  'test-venue',
  'venue@test.com',
  '123 Test St',
  'Test City',
  'TC',
  'US',
  'theater',
  5000,
  'ACTIVE',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 3. Create venue staff relationship so test user can create events
INSERT INTO venue_staff (
  id,
  venue_id,
  user_id,
  role,
  is_active,
  created_at,
  updated_at
)
VALUES (
  uuid_generate_v1(),
  '7025024b-7dab-4e9a-87d9-ea83caf1dc06',
  '35fd0e42-a3f0-11f0-a02b-00155d9c6820',
  'owner',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify test data
SELECT 'Test User:' as type, email, id FROM users WHERE email = 'test@test.com';
SELECT 'Test Venue:' as type, name, id FROM venues WHERE id = '7025024b-7dab-4e9a-87d9-ea83caf1dc06';
SELECT 'Venue Staff:' as type, role FROM venue_staff WHERE venue_id = '7025024b-7dab-4e9a-87d9-ea83caf1dc06' AND user_id = '35fd0e42-a3f0-11f0-a02b-00155d9c6820';
