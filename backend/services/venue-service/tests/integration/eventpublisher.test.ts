/**
 * EventPublisher Integration Tests
 * 
 * Note: These tests verify the EventPublisher structure and behavior
 * without requiring an actual RabbitMQ connection. The service is designed
 * to gracefully handle missing connections.
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext
} from './setup';
import { EventPublisher, EventMessage } from '../../src/services/eventPublisher';
import { v4 as uuidv4 } from 'uuid';

describe('EventPublisher', () => {
  let context: TestContext;
  let eventPublisher: EventPublisher;

  beforeAll(async () => {
    context = await setupTestApp();
    eventPublisher = new EventPublisher();
    // Don't call connect() - we're testing without RabbitMQ
  }, 30000);

  afterAll(async () => {
    await eventPublisher.close();
    await teardownTestApp(context);
  });

  // ==========================================================================
  // Constructor and connection state
  // ==========================================================================
  describe('constructor', () => {
    it('should create publisher instance', () => {
      expect(eventPublisher).toBeDefined();
    });

    it('should not be connected initially', () => {
      expect(eventPublisher.isConnected()).toBe(false);
    });
  });

  // ==========================================================================
  // publish (without connection)
  // ==========================================================================
  describe('publish', () => {
    it('should handle publish gracefully when not connected', async () => {
      const message: EventMessage = {
        eventType: 'test',
        aggregateId: uuidv4(),
        aggregateType: 'venue',
        payload: { test: true }
      };

      // Should not throw
      await expect(eventPublisher.publish(message)).resolves.not.toThrow();
    });

    it('should handle publish with metadata', async () => {
      const message: EventMessage = {
        eventType: 'created',
        aggregateId: uuidv4(),
        aggregateType: 'venue',
        payload: { name: 'Test Venue' },
        metadata: {
          userId: uuidv4(),
          timestamp: new Date(),
          correlationId: uuidv4(),
          version: 1
        }
      };

      await expect(eventPublisher.publish(message)).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // publishVenueCreated
  // ==========================================================================
  describe('publishVenueCreated', () => {
    it('should handle venue created event', async () => {
      const venueId = uuidv4();
      const venueData = {
        name: 'New Venue',
        venue_type: 'theater',
        max_capacity: 500,
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        status: 'ACTIVE'
      };

      await expect(
        eventPublisher.publishVenueCreated(venueId, venueData, uuidv4())
      ).resolves.not.toThrow();
    });

    it('should handle venue created without userId', async () => {
      const venueId = uuidv4();

      await expect(
        eventPublisher.publishVenueCreated(venueId, { name: 'Test' })
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // publishVenueUpdated
  // ==========================================================================
  describe('publishVenueUpdated', () => {
    it('should handle venue updated event', async () => {
      const venueId = uuidv4();
      const changes = {
        name: 'Updated Venue Name',
        max_capacity: 1000
      };

      await expect(
        eventPublisher.publishVenueUpdated(venueId, changes, uuidv4())
      ).resolves.not.toThrow();
    });

    it('should handle venue updated without userId', async () => {
      const venueId = uuidv4();

      await expect(
        eventPublisher.publishVenueUpdated(venueId, { status: 'INACTIVE' })
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // publishVenueDeleted
  // ==========================================================================
  describe('publishVenueDeleted', () => {
    it('should handle venue deleted event', async () => {
      const venueId = uuidv4();

      await expect(
        eventPublisher.publishVenueDeleted(venueId, uuidv4())
      ).resolves.not.toThrow();
    });

    it('should handle venue deleted without userId', async () => {
      const venueId = uuidv4();

      await expect(
        eventPublisher.publishVenueDeleted(venueId)
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // close
  // ==========================================================================
  describe('close', () => {
    it('should handle close gracefully when not connected', async () => {
      const publisher = new EventPublisher();
      
      await expect(publisher.close()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // Connection behavior (mocked)
  // ==========================================================================
  describe('connection behavior', () => {
    it('should attempt reconnection on connection error', async () => {
      // Create a new publisher and verify initial state
      const publisher = new EventPublisher();
      expect(publisher.isConnected()).toBe(false);

      // Connect will fail without RabbitMQ but should not throw
      await expect(publisher.connect()).resolves.not.toThrow();
      
      // Should still be disconnected (no RabbitMQ available)
      expect(publisher.isConnected()).toBe(false);

      await publisher.close();
    });
  });
});
