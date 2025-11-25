import axios from 'axios';
import { Pool } from 'pg';

const BASE_URL = 'http://localhost:3003/api/v1';
const AUTH_URL = 'http://localhost:3001/api/v1';
const VENUE_URL = 'http://localhost:3002/api/v1';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

describe('Age Restriction Test', () => {
  let accessToken: string;
  let userId: string;
  let venueId: string;
  let categoryId: string;
  let eventId: string;

  beforeAll(async () => {
    // Create test user
    const authResponse = await axios.post(`${AUTH_URL}/auth/register`, {
      email: `test-age-${Date.now()}@example.com`,
      password: 'Test123!@#',
      full_name: 'Age Test User'
    });
    accessToken = authResponse.data.data.tokens.accessToken;
    userId = authResponse.data.data.user.id;

    // Create test venue
    const venueResponse = await axios.post(`${VENUE_URL}/venues`, {
      name: 'Age Test Venue',
      address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345',
      country: 'US',
      max_capacity: 1000
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    venueId = venueResponse.data.venue.id;

    // Get category
    const catResult = await pool.query('SELECT id FROM event_categories LIMIT 1');
    categoryId = catResult.rows[0].id;
  });

  afterAll(async () => {
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

  test('should create event with age_restriction = 18', async () => {
    const response = await axios.post(`${BASE_URL}/events`, {
      name: 'Age Restriction Test Event',
      description: 'Testing age restriction field',
      venue_id: venueId,
      category: categoryId,
      age_restriction: 18,
      event_date: '2025-12-01T19:00:00Z',
      capacity: 100
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    expect(response.status).toBe(201);
    eventId = response.data.event.id;

    // Check database
    const dbResult = await pool.query(
      'SELECT age_restriction FROM events WHERE id = $1',
      [eventId]
    );

    console.log('Database age_restriction:', dbResult.rows[0].age_restriction);
    expect(dbResult.rows[0].age_restriction).toBe(18);
  });
});

