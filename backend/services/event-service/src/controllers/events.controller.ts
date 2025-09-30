import { FastifyRequest, FastifyReply } from 'fastify';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { v4 as uuidv4 } from 'uuid';
import { createDatabaseConnection } from '../config/database';

import { serviceCache } from '../services/cache-integration';
// WP-8: Import search indexer at the top of the file
// @ts-ignore - JavaScript file in shared root
const { SearchIndexerHelper } = require('../../../../shared/search-indexer-helper');
const searchIndexer = new SearchIndexerHelper('event-service');
searchIndexer.initialize().catch(console.error);
import { EventService } from '../services/event.service';
import { VenueServiceClient } from '../services/venue-service.client';
const db = createDatabaseConnection();

interface CreateEventBody {
  name: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  venue_id: string;
  tiers: Array<{
    name: string;
    price_cents: number;
    currency: string;
    total_qty: number;
  }>;
}

// Helper to get tenant UUID from string or use default
async function getTenantUuid(tenantId: string): Promise<string> {
  // Cache tenant lookups for 30 minutes
  const cacheKey = `tenant:${tenantId}`;

  const cached = await serviceCache.get(cacheKey);
  if (cached) return cached;

  if (tenantId === 'default') {
    const result = await db('tenants').where({ name: 'default' }).first();
    const uuid = result ? result.id : '550e8400-e29b-41d4-a716-446655440099';
    await serviceCache.set(cacheKey, uuid, 1800); // 30 min cache
    return uuid;
  }

  await serviceCache.set(cacheKey, tenantId, 1800);
  return tenantId;
}

// Add this helper function to index events

export async function createEvent(
  request: FastifyRequest<{ Body: CreateEventBody }>,
  reply: FastifyReply
) {
  try {
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const { name, description, starts_at, ends_at, venue_id, tiers } = request.body;
    
    // Get auth token from request
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id || 'system';
    
    // Initialize services
    const venueClient = new VenueServiceClient();
    const eventService = new EventService(db, venueClient, null as any);
    
    // Validate venue exists and user has access
    try {
      const hasAccess = await venueClient.validateVenueAccess(venue_id, authToken);
      if (!hasAccess) {
        return reply.status(400).send({ 
          error: 'Invalid venue or no access to venue' 
        });
      }
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        return reply.status(404).send({ 
          error: 'Venue does not exist' 
        });
      }
      throw error;
    }
    
    // Create event using the service (which has additional validation)
    const eventData = {
      venue_id,
      name,
      title: name,
      description,
      start_date: new Date(starts_at),
      end_date: new Date(ends_at),
      starts_at: new Date(starts_at),
      ends_at: new Date(ends_at),
      status: 'draft' as any,
      tiers
    };
    
    // Use transaction for event + tiers
    const trx = await db.transaction();
    try {
      const tenantUuid = await getTenantUuid(tenantIdHeader);
      
      // Create event
      const eventId = uuidv4();
      const [event] = await trx('events')
        .insert({
          id: eventId,
          tenant_id: tenantUuid,
          venue_id,
          title: name,
          name: name,
          description,
          start_date: new Date(starts_at),
          end_date: new Date(ends_at),
          starts_at: new Date(starts_at),
          ends_at: new Date(ends_at),
          status: 'draft',
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      // Create tiers
      if (tiers && tiers.length > 0) {
        const tierRecords = tiers.map(tier => ({
          id: uuidv4(),
          event_id: eventId,
          tenant_id: tenantUuid,
          name: tier.name,
          price_cents: tier.price_cents,
          currency: tier.currency || 'USD',
          total_qty: tier.total_qty,
          sold_qty: 0,
          reserved_qty: 0,
          created_at: new Date(),
          updated_at: new Date()
        }));
        await trx('event_tiers').insert(tierRecords);
      }
      
      await trx.commit();
      
      // Index for search after creation
      await searchIndexer.indexEvent({
        id: event.id,
        name: event.name,
        venue_id: event.venue_id,
        starts_at: event.starts_at
      });
      
      return reply.status(201).send(event);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error: any) {
    console.error('Failed to create event:', error);
    return reply.status(500).send({ 
      error: 'Failed to create event' 
    });
  }
}

export async function getEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const eventId = request.params.id;
    const cacheKey = `event:${eventId}`;

    // Try cache first
    let eventData = await serviceCache.get(cacheKey);

    if (eventData) {
      reply.header('X-Cache', 'HIT');
      return reply.send(eventData);
    }

    // Cache miss - get from database
    const event = await db('events').where({ id: eventId }).first();

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const tiers = await db('event_tiers').where({ event_id: event.id });

    eventData = {
      id: event.id,
      name: event.title || event.name,
      description: event.description,
      starts_at: event.starts_at || event.start_date,
      ends_at: event.ends_at || event.end_date,
      status: event.status,
      venue_id: event.venue_id,
      tiers
    };

    // Cache for 10 minutes
    await serviceCache.set(cacheKey, eventData, 600);

    reply.header('X-Cache', 'MISS');
    return reply.send(eventData);
  } catch (error) {
    console.error('Error fetching event:', error);
    return reply.status(500).send({ error: 'Failed to fetch event' });
  }
}

export async function listEvents(
  request: FastifyRequest<{ Querystring: { status?: string; limit?: number; offset?: number } }>,
  reply: FastifyReply
) {
  try {
    const { status = 'DRAFT', limit = 20, offset = 0 } = request.query;

    // Create cache key based on query params
    const cacheKey = `events:list:${status}:${limit}:${offset}`;

    // Try cache first
    let cachedEvents = await serviceCache.get(cacheKey);

    if (cachedEvents) {
      reply.header('X-Cache', 'HIT');
      return reply.send(cachedEvents);
    }

    // Cache miss - get from database
    let query = db('events');

    if (status) {
      query = query.where({ status: status.toLowerCase() });
    }

    const events = await query.limit(limit).offset(offset).orderBy('created_at', 'desc');

    const response = {
      events: events.map(e => ({
        id: e.id,
        name: e.title || e.name,
        description: e.description,
        starts_at: e.starts_at || e.start_date,
        ends_at: e.ends_at || e.end_date,
        status: e.status,
        venue_id: e.venue_id
      }))
    };

    // Cache for 5 minutes
    await serviceCache.set(cacheKey, response, 300);

    reply.header('X-Cache', 'MISS');
    return reply.send(response);
  } catch (error) {
    console.error('Error listing events:', error);
    return reply.status(500).send({ error: 'Failed to list events' });
  }
}

export async function publishEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const trx = await db.transaction();

  try {
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const tenantUuid = await getTenantUuid(tenantIdHeader);
    const eventId = request.params.id;

    // Update event status
    const [event] = await trx('events')
      .where({ id: eventId })
      .update({ status: 'published', updated_at: new Date() })
      .returning('*');

    if (!event) {
      await trx.rollback();
      return reply.status(404).send({ error: 'Event not found' });
    }

    // Get tiers for pricing
    const tiers = await trx('event_tiers').where({ event_id: eventId });
    const prices = tiers.map(t => t.price_cents);

    // Upsert into search index
    await trx('search_index_events')
      .insert({
        id: uuidv4(),
        event_id: eventId,
        tenant_id: tenantUuid,
        name: event.title || event.name,
        description: event.description,
        starts_at: event.starts_at || event.start_date,
        ends_at: event.ends_at || event.end_date,
        status: 'PUBLISHED',
        min_price_cents: Math.min(...prices),
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('event_id')
      .merge();

    // WP-8: Re-index after publish
    const publishedEvent = await trx('events').where({ id: eventId }).first();
    try {
      await searchIndexer.indexEvent(publishedEvent);
      console.log(`✅ Event ${eventId} re-indexed after publish`);
    } catch (err) {
      console.error('Failed to re-index event:', err);
    }

    // Insert into outbox
    await trx('outbox').insert({
      id: uuidv4(),
      tenant_id: tenantUuid,
      aggregate_id: eventId,
      event_type: 'event.published',
      payload: JSON.stringify({
        event_id: eventId,
        name: event.title || event.name,
        status: 'PUBLISHED',
        published_at: new Date()
      }),
      processed: false,
      created_at: new Date()
    });

    await trx.commit();

    // Invalidate all caches for this event
    await serviceCache.delete([
      `event:${eventId}`,
      `events:list:*`,
      `venue:${event.venue_id}:events`
    ]);

    // Publish cache invalidation event
    try {
      const amqp = require('amqplib');
      const connection = await amqp.connect(process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672');
      const channel = await connection.createChannel();

      await channel.publish(
        'cache.invalidation',
        'event.published',
        Buffer.from(JSON.stringify({
          type: 'event.published',
          entityId: eventId,
          venueId: event.venue_id,
          timestamp: Date.now()
        }))
      );

      await connection.close();
    } catch (err) {
      console.error('Failed to publish invalidation:', err);
    }

    return reply.send({
      id: event.id,
      name: event.title || event.name,
      status: 'published',
      message: 'Event published successfully'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error publishing event:', error);
    return reply.status(500).send({ error: 'Failed to publish event', details: (error as Error).message });
  }
}

export async function updateEvent(
  request: FastifyRequest<{ 
    Params: { id: string },
    Body: Partial<CreateEventBody> & { 
      status?: string,
      total_tickets?: number,
      available_tickets?: number 
    }
  }>,
  reply: FastifyReply
) {
  try {
    const eventId = request.params.id;
    const tenantIdHeader = (request.headers['x-tenant-id'] as string) || 'default';
    const updates = request.body;
    
    // Get auth token from request
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id || 'system';
    
    // Initialize services
    const venueClient = new VenueServiceClient();
    const eventService = new EventService(db, venueClient, null as any);
    
    // First check if event exists
    const existingEvent = await db('events')
      .where({ id: eventId })
      .first();
      
    if (!existingEvent) {
      return reply.status(404).send({
        error: 'Event not found'
      });
    }
    
    // If venue_id is being updated, validate the new venue
    if (updates.venue_id) {
      try {
        const hasAccess = await venueClient.validateVenueAccess(updates.venue_id, authToken);
        if (!hasAccess) {
          return reply.status(400).send({
            error: 'Invalid venue or no access to venue'
          });
        }
      } catch (error: any) {
        if (error.message?.includes('does not exist')) {
          return reply.status(404).send({
            error: 'Venue does not exist'
          });
        }
        throw error;
      }
    }
    
    // Build update object
    const updateData: any = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.starts_at) updateData.start_date = new Date(updates.starts_at);
    if (updates.ends_at) updateData.end_date = new Date(updates.ends_at);
    if (updates.venue_id) updateData.venue_id = updates.venue_id;
    if (updates.status) updateData.status = updates.status;
    if (updates.total_tickets !== undefined) updateData.total_tickets = updates.total_tickets;
    if (updates.available_tickets !== undefined) updateData.available_tickets = updates.available_tickets;
    
    updateData.updated_at = new Date();
    
    // Update the event
    await db('events')
      .where({ id: eventId })
      .update(updateData);
    
    // Fetch and return updated event
    const updatedEvent = await db('events')
      .where({ id: eventId })
      .first();
      
    // Clear cache for this event
    await serviceCache.delete(`event:${eventId}`);
    
    // Index updated event for search
    await searchIndexer.indexData('events', {
      id: updatedEvent.id,
      name: updatedEvent.name,
      description: updatedEvent.description,
      venue_id: updatedEvent.venue_id,
      status: updatedEvent.status,
      start_date: updatedEvent.start_date,
      end_date: updatedEvent.end_date
    });
    
    return reply.send({
      ...updatedEvent,
      venue_id: updatedEvent.venue_id
    });
    
  } catch (error) {
    console.error('Error updating event:', error);
    return reply.status(500).send({ 
      error: 'Failed to update event' 
    });
  }
}
