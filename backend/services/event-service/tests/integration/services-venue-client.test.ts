/**
 * VenueServiceClient Integration Tests
 *
 * Tests:
 * - validateVenueAccess: success, 404 -> NotFoundError, 403 -> ForbiddenError, other -> ValidationError
 * - getVenue: success, 404 -> NotFoundError, 403 -> ForbiddenError, other -> ValidationError
 * - Circuit breaker behavior
 * - Request headers and URL construction
 */

import http from 'http';
import { AddressInfo } from 'net';
import { v4 as uuidv4 } from 'uuid';

describe('VenueServiceClient', () => {
  let server: http.Server;
  let serverPort: number;
  let requestLog: { method: string; url: string; headers: any }[] = [];
  let mockHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  // We'll dynamically import the client after setting env vars
  let VenueServiceClient: any;
  let client: any;

  beforeAll((done) => {
    // Create a mock HTTP server to simulate venue-service
    server = http.createServer((req, res) => {
      requestLog.push({
        method: req.method || '',
        url: req.url || '',
        headers: req.headers
      });
      mockHandler(req, res);
    });

    server.listen(0, () => {
      serverPort = (server.address() as AddressInfo).port;
      // Set env var BEFORE importing the module
      process.env.VENUE_SERVICE_URL = `http://localhost:${serverPort}`;
      done();
    });
  });

  afterAll((done) => {
    delete process.env.VENUE_SERVICE_URL;
    server.close(done);
  });

  beforeEach(async () => {
    requestLog = [];
    // Default handler returns 200
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'venue-123', name: 'Test Venue', max_capacity: 1000 }));
    };

    // Clear module cache and re-import to get fresh instance with correct URL
    jest.resetModules();
    const module = await import('../../src/services/venue-service.client');
    VenueServiceClient = module.VenueServiceClient;
    client = new VenueServiceClient();
  });

  // ==========================================================================
  // validateVenueAccess
  // ==========================================================================
  describe('validateVenueAccess', () => {
    it('should return true when venue exists and accessible (200)', async () => {
      const venueId = uuidv4();
      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: venueId, name: 'Test Venue' }));
      };

      const result = await client.validateVenueAccess(venueId, 'Bearer test-token');

      expect(result).toBe(true);
      expect(requestLog.length).toBe(1);
      expect(requestLog[0].url).toBe(`/api/v1/venues/${venueId}`);
    });

    it('should pass authorization header', async () => {
      const venueId = uuidv4();
      const token = 'Bearer my-auth-token-123';

      await client.validateVenueAccess(venueId, token);

      expect(requestLog[0].headers.authorization).toBe(token);
    });

    it('should pass content-type header', async () => {
      const venueId = uuidv4();

      await client.validateVenueAccess(venueId, 'Bearer token');

      expect(requestLog[0].headers['content-type']).toBe('application/json');
    });

    it('should throw NotFoundError on 404 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Venue not found' }));
      };

      await expect(client.validateVenueAccess(uuidv4(), 'Bearer token'))
        .rejects.toThrow('Venue');
    });

    it('should throw ForbiddenError on 403 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
      };

      await expect(client.validateVenueAccess(uuidv4(), 'Bearer token'))
        .rejects.toThrow('No access to this venue');
    });

    it('should throw ValidationError on 500 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      };

      await expect(client.validateVenueAccess(uuidv4(), 'Bearer token'))
        .rejects.toThrow('Invalid venue or no access');
    });

    it('should throw ValidationError on 401 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
      };

      await expect(client.validateVenueAccess(uuidv4(), 'Bearer bad-token'))
        .rejects.toThrow('Invalid venue or no access');
    });

    it('should throw ValidationError on 400 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      };

      await expect(client.validateVenueAccess('invalid-uuid', 'Bearer token'))
        .rejects.toThrow('Invalid venue or no access');
    });

    it('should construct correct URL path', async () => {
      const venueId = '12345678-1234-1234-1234-123456789012';

      await client.validateVenueAccess(venueId, 'Bearer token');

      expect(requestLog[0].url).toBe('/api/v1/venues/12345678-1234-1234-1234-123456789012');
    });
  });

  // ==========================================================================
  // getVenue
  // ==========================================================================
  describe('getVenue', () => {
    it('should return venue data on success', async () => {
      const venueId = uuidv4();
      const venueData = {
        id: venueId,
        name: 'Madison Square Garden',
        max_capacity: 20000,
        address: '4 Pennsylvania Plaza',
        city: 'New York'
      };

      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(venueData));
      };

      const result = await client.getVenue(venueId, 'Bearer token');

      expect(result).toEqual(venueData);
      expect(result.name).toBe('Madison Square Garden');
      expect(result.max_capacity).toBe(20000);
    });

    it('should pass authorization header', async () => {
      const token = 'Bearer venue-access-token';

      await client.getVenue(uuidv4(), token);

      expect(requestLog[0].headers.authorization).toBe(token);
    });

    it('should throw NotFoundError on 404 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      };

      await expect(client.getVenue(uuidv4(), 'Bearer token'))
        .rejects.toThrow('Venue');
    });

    it('should throw ForbiddenError on 403 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
      };

      await expect(client.getVenue(uuidv4(), 'Bearer token'))
        .rejects.toThrow('No access to this venue');
    });

    it('should throw ValidationError on 500 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      };

      await expect(client.getVenue(uuidv4(), 'Bearer token'))
        .rejects.toThrow('Failed to retrieve venue details');
    });

    it('should throw ValidationError on 502 response', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad gateway' }));
      };

      await expect(client.getVenue(uuidv4(), 'Bearer token'))
        .rejects.toThrow('Failed to retrieve venue details');
    });

    it('should parse JSON response correctly', async () => {
      const complexVenue = {
        id: uuidv4(),
        name: 'Complex Venue',
        max_capacity: 5000,
        sections: [
          { name: 'Floor', capacity: 1000 },
          { name: 'Balcony', capacity: 4000 }
        ],
        amenities: ['parking', 'food', 'vip'],
        location: { lat: 40.7128, lng: -74.006 }
      };

      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(complexVenue));
      };

      const result = await client.getVenue(uuidv4(), 'Bearer token');

      expect(result.sections).toHaveLength(2);
      expect(result.amenities).toContain('parking');
      expect(result.location.lat).toBe(40.7128);
    });
  });

  // ==========================================================================
  // Circuit Breaker
  // ==========================================================================
  describe('Circuit Breaker', () => {
    it('should allow requests when circuit is closed', async () => {
      let requestCount = 0;
      mockHandler = (_req, res) => {
        requestCount++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'v1' }));
      };

      await client.validateVenueAccess(uuidv4(), 'Bearer token');
      await client.validateVenueAccess(uuidv4(), 'Bearer token');
      await client.validateVenueAccess(uuidv4(), 'Bearer token');

      expect(requestCount).toBe(3);
    });

    it('should continue working after some failures', async () => {
      let requestCount = 0;

      // First request fails
      mockHandler = (_req, res) => {
        requestCount++;
        if (requestCount <= 2) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'v1' }));
        }
      };

      // First two fail
      await expect(client.validateVenueAccess(uuidv4(), 'Bearer token')).rejects.toThrow();
      await expect(client.validateVenueAccess(uuidv4(), 'Bearer token')).rejects.toThrow();

      // Third should succeed
      const result = await client.validateVenueAccess(uuidv4(), 'Bearer token');
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // Error Message Parsing
  // ==========================================================================
  describe('Error Message Parsing', () => {
    it('should detect 404 in error message string', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      };

      await expect(client.validateVenueAccess(uuidv4(), 'Bearer token'))
        .rejects.toThrow('Venue');
    });

    it('should detect 403 in error message string', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
      };

      await expect(client.validateVenueAccess(uuidv4(), 'Bearer token'))
        .rejects.toThrow('No access to this venue');
    });

    it('should handle non-JSON error responses', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html><body>Internal Server Error</body></html>');
      };

      await expect(client.getVenue(uuidv4(), 'Bearer token'))
        .rejects.toThrow('Failed to retrieve venue details');
    });

    it('should handle empty error responses', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(500);
        res.end();
      };

      await expect(client.getVenue(uuidv4(), 'Bearer token'))
        .rejects.toThrow();
    });
  });

  // ==========================================================================
  // Connection Errors
  // ==========================================================================
  describe('Connection Errors', () => {
    it('should handle connection refused', async () => {
      // Create client pointing to port nothing is listening on
      process.env.VENUE_SERVICE_URL = 'http://localhost:59999';
      jest.resetModules();
      const module = await import('../../src/services/venue-service.client');
      const badClient = new module.VenueServiceClient();

      await expect(badClient.validateVenueAccess(uuidv4(), 'Bearer token'))
        .rejects.toThrow();

      // Reset for other tests
      process.env.VENUE_SERVICE_URL = `http://localhost:${serverPort}`;
    });
  });

  // ==========================================================================
  // Singleton Export
  // ==========================================================================
  describe('Singleton Export', () => {
    it('should export venueServiceClient singleton', async () => {
      jest.resetModules();
      const { venueServiceClient } = await import('../../src/services/venue-service.client');
      expect(venueServiceClient).toBeDefined();
    });
  });

  // ==========================================================================
  // Multiple Venues
  // ==========================================================================
  describe('Multiple Venues', () => {
    it('should handle multiple venue requests correctly', async () => {
      const venues: Record<string, any> = {
        'venue-1': { id: 'venue-1', name: 'Arena A', max_capacity: 10000 },
        'venue-2': { id: 'venue-2', name: 'Arena B', max_capacity: 5000 },
        'venue-3': { id: 'venue-3', name: 'Arena C', max_capacity: 2000 }
      };

      mockHandler = (req, res) => {
        const venueId = req.url?.split('/').pop();
        if (venueId && venues[venueId]) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(venues[venueId]));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      };

      const result1 = await client.getVenue('venue-1', 'Bearer token');
      const result2 = await client.getVenue('venue-2', 'Bearer token');
      const result3 = await client.getVenue('venue-3', 'Bearer token');

      expect(result1.name).toBe('Arena A');
      expect(result2.name).toBe('Arena B');
      expect(result3.name).toBe('Arena C');

      await expect(client.getVenue('venue-unknown', 'Bearer token'))
        .rejects.toThrow('Venue');
    });
  });
});
