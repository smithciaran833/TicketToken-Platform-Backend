import axios from 'axios';
import { Pool } from 'pg';

const BASE_URL = 'http://localhost:3003/api/v1';
const AUTH_URL = 'http://localhost:3001';
const VENUE_URL = 'http://localhost:3002/api/v1';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

describe('Single Fix Test - Age Restriction', () => {
  let accessToken: string;
  let userId: string;
  let venueId: string;
  let categoryId: string;
  let eventId: string;

  beforeAll(async () => {
    // Register user - EXACT same as comprehensive test
    const authResponse = await axios.post(`${AUTH_URL}/auth/register`, {
      email: `test-single-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      full_name: 'Single Test User'
    });

    accessToken = authResponse.data.data.tokens.accessToken;
    userId = authResponse.data.data.user.id;

    // Create venue - EXACT same as comprehensive test
    const venueResponse = await axios.post(
      `${VENUE_URL}/venues`,
      {
        name: 'Single Test Venue',
        address: '123 Single St',
        city: 'Test City',
        state: 'CA',
        zip_code: '90210',
        country: 'US',
        timezone: 'America/Los_Angeles',
        max_capacity: 5000
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    venueId = venueResponse.data.venue.id;

    // Get category - EXACT same as comprehensive test
    const result = await pool.query('SELECT id FROM event_categories LIMIT 1');
    categoryId = result.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    if (eventId) {
      await pool.query('DELETE FROM event_capacity WHERE event_id = $1', [eventId]);
      await pool.query('DELETE FROM event_schedules WHERE event_id = $1', [eventId]);
      await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    }
    if (venueId) {
      await pool.query('DELETE FROM venues WHERE id = $1', [venueId]);
    }
    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.end();
  });

  test('age_restriction field should be saved correctly', async () => {
    console.log('\n=== CREATING EVENT ===');
    const response = await axios.post(
      `${BASE_URL}/events`,
      {
        name: 'Test Event with Age',
        description: 'Testing age restriction',
        venue_id: venueId,
        category: categoryId,
        age_restriction: 18,
        event_date: '2025-12-01T19:00:00Z',
        capacity: 100
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    console.log('Response status:', response.status);
    console.log('Event ID:', response.data.event.id);
    console.log('Age restriction from API:', response.data.event.age_restriction);

    eventId = response.data.event.id;

    // Check database directly
    const dbResult = await pool.query(
      'SELECT age_restriction FROM events WHERE id = $1',
      [eventId]
    );

    console.log('Age restriction from DB:', dbResult.rows[0].age_restriction);
    console.log('Expected: 18');
    console.log('Match:', dbResult.rows[0].age_restriction === 18);

    expect(response.status).toBe(201);
    expect(dbResult.rows[0].age_restriction).toBe(18);
  });
});
