import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { listingService } from '../../src/services/listing.service';
import { db } from '../../src/config/database';
import { v4 as uuidv4 } from 'uuid';

describe('Distributed Locking - Marketplace Service', () => {
  const testEventId = 'f90ed044-82a9-4b9f-bb99-bcabf8a1be1a';
  const testVenueId = '550e8400-e29b-41d4-a716-446655440001';
  const testSellerId = uuidv4();

  afterAll(async () => {
    await db.destroy();
  });

  describe('Listing Creation Race Conditions', () => {
    it('prevents duplicate listings for same ticket', async () => {
      const ticketId = uuidv4();

      const createPromises = Array.from({ length: 10 }, () =>
        listingService.createListing({
          ticketId,
          sellerId: testSellerId,
          eventId: testEventId,
          venueId: testVenueId,
          originalFaceValue: 10000,
          walletAddress: 'test-wallet'
        }).catch(err => err)
      );

      const results = await Promise.all(createPromises);

      const successes = results.filter(r => !(r instanceof Error));
      const failures = results.filter(r => r instanceof Error);

      console.log(`Listing creation: ${successes.length} success, ${failures.length} failures`);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);

      const listing = successes[0] as any;
      await db('marketplace_listings').where({ id: listing.id }).del();
    }, 30000);
  });

  describe('Listing Cancellation Race Conditions', () => {
    it('prevents double-cancellation', async () => {
      const ticketId = uuidv4();
      
      const listing = await listingService.createListing({
        ticketId,
        sellerId: testSellerId,
        eventId: testEventId,
        venueId: testVenueId,
        originalFaceValue: 10000,
        walletAddress: 'test-wallet'
      });

      const cancelPromises = Array.from({ length: 10 }, () =>
        listingService.cancelListing(listing.id, testSellerId).catch(err => err)
      );

      const results = await Promise.all(cancelPromises);

      const successes = results.filter(r => !(r instanceof Error));
      const failures = results.filter(r => r instanceof Error);

      console.log(`Cancellation: ${successes.length} success, ${failures.length} failures`);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);

      await db('marketplace_listings').where({ id: listing.id }).del();
    }, 30000);
  });

  describe('Price Update Race Conditions', () => {
    it('prevents concurrent price updates from creating inconsistency', async () => {
      const ticketId = uuidv4();
      
      const listing = await listingService.createListing({
        ticketId,
        sellerId: testSellerId,
        eventId: testEventId,
        venueId: testVenueId,
        originalFaceValue: 10000,
        walletAddress: 'test-wallet'
      });

      const prices = [15000, 16000, 17000, 18000, 19000, 20000, 21000, 22000, 23000, 24000];
      
      const updatePromises = prices.map(price =>
        listingService.updateListingPrice({
          listingId: listing.id,
          newPrice: price,
          userId: testSellerId
        }).catch(err => err)
      );

      const results = await Promise.all(updatePromises);

      const successes = results.filter(r => !(r instanceof Error));
      
      console.log(`Price updates: ${successes.length} succeeded`);

      expect(successes.length).toBe(10);

      const finalListing = await db('marketplace_listings')
        .where({ id: listing.id })
        .first();

      expect(prices.includes(finalListing.price)).toBe(true);

      await db('marketplace_listings').where({ id: listing.id }).del();
    }, 30000);
  });
});
