import request from 'supertest';
import app from '../../app';
import { createTestUser, createAuthToken } from '../factories/user.factory';
import { createTestListing } from '../factories/listing.factory';
import { db } from '../../config/database';

describe('Listing Lifecycle', () => {
  let authToken: string;
  let userId: string;
  
  beforeEach(() => {
    const user = createTestUser();
    userId = user.id;
    authToken = createAuthToken(user);
  });

  describe('POST /api/v1/marketplace/listings', () => {
    it('should create a listing with valid data', async () => {
      const listingData = {
        ticket_id: 'test-ticket-id',
        price: 100.00,
        notes: 'Test listing'
      };
      
      const response = await request(app)
        .post('/api/v1/marketplace/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(listingData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.price).toBe(100);
    });

    it('should reject listing with price below minimum', async () => {
      const listingData = {
        ticket_id: 'test-ticket-id',
        price: 0.50  // Below MIN_LISTING_PRICE (1.00)
      };
      
      const response = await request(app)
        .post('/api/v1/marketplace/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(listingData)
        .expect(400);
      
      expect(response.body.error).toContain('Price must be at least');
    });

    it('should reject listing without authentication', async () => {
      const listingData = {
        ticket_id: 'test-ticket-id',
        price: 100.00
      };
      
      await request(app)
        .post('/api/v1/marketplace/listings')
        .send(listingData)
        .expect(401);
    });
  });

  describe('GET /api/v1/marketplace/listings/:id', () => {
    it('should retrieve a listing by id', async () => {
      // First create a listing
      const createResponse = await request(app)
        .post('/api/v1/marketplace/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ticket_id: 'test-ticket-id',
          price: 150.00
        })
        .expect(201);
      
      const listingId = createResponse.body.data.id;
      
      // Now retrieve it
      const getResponse = await request(app)
        .get(`/api/v1/marketplace/listings/${listingId}`)
        .expect(200);
      
      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.id).toBe(listingId);
      expect(getResponse.body.data.price).toBe(150);
    });

    it('should return 404 for non-existent listing', async () => {
      const fakeId = 'non-existent-id';
      
      await request(app)
        .get(`/api/v1/marketplace/listings/${fakeId}`)
        .expect(404);
    });
  });

  describe('DELETE /api/v1/marketplace/listings/:id', () => {
    it('should allow seller to cancel their listing', async () => {
      // Create a listing
      const createResponse = await request(app)
        .post('/api/v1/marketplace/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ticket_id: 'test-ticket-id',
          price: 100.00
        })
        .expect(201);
      
      const listingId = createResponse.body.data.id;
      
      // Cancel it
      const cancelResponse = await request(app)
        .delete(`/api/v1/marketplace/listings/${listingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(cancelResponse.body.success).toBe(true);
      expect(cancelResponse.body.message).toContain('cancelled');
    });

    it('should prevent other users from cancelling a listing', async () => {
      // Create listing as user 1
      const user1 = createTestUser();
      const token1 = createAuthToken(user1);
      
      const createResponse = await request(app)
        .post('/api/v1/marketplace/listings')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          ticket_id: 'test-ticket-id',
          price: 100.00
        })
        .expect(201);
      
      const listingId = createResponse.body.data.id;
      
      // Try to cancel as user 2
      const user2 = createTestUser();
      const token2 = createAuthToken(user2);
      
      await request(app)
        .delete(`/api/v1/marketplace/listings/${listingId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);
    });
  });
});
