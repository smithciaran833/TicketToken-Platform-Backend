import { AuthenticatedHandler } from '../types';
import Joi from 'joi';
import { EventPricingModel } from '../models';

const createTicketTypeSchema = Joi.object({
  name: Joi.string().min(3).max(255).required(),
  description: Joi.string().optional().allow(''),
  base_price: Joi.number().min(0).required(),
  capacity_id: Joi.string().uuid().optional(),
  schedule_id: Joi.string().uuid().optional(),
  currency: Joi.string().length(3).default('USD'),
  service_fee: Joi.number().min(0).optional(),
  facility_fee: Joi.number().min(0).optional(),
  tax_rate: Joi.number().min(0).max(1).optional(),
  max_per_order: Joi.number().integer().min(1).optional(),
  tier: Joi.string().optional(),
  metadata: Joi.object().unknown(true).optional()
});

const updateTicketTypeSchema = Joi.object({
  name: Joi.string().min(3).max(255).optional(),
  description: Joi.string().optional().allow(''),
  base_price: Joi.number().min(0).optional(),
  service_fee: Joi.number().min(0).optional(),
  facility_fee: Joi.number().min(0).optional(),
  tax_rate: Joi.number().min(0).max(1).optional(),
  currency: Joi.string().length(3).optional(),
  max_per_order: Joi.number().integer().min(1).optional(),
  tier: Joi.string().optional(),
  is_active: Joi.boolean().optional(),
  is_visible: Joi.boolean().optional(),
  metadata: Joi.object().unknown(true).optional()
}).min(1);

export const getTicketTypes: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const tenantId = (request as any).tenantId;
  const { db, eventService, pricingService } = request.container.cradle;

  try {
    // Verify event exists and user has access
    await eventService.getEvent(id, tenantId);

    // Get pricing (which represents ticket types in new schema)
    const pricing = await pricingService.getEventPricing(id, tenantId);

    return reply.send({
      success: true,
      data: pricing
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error getting ticket types:', error);
    throw error;
  }
};

export const createTicketType: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const tenantId = (request as any).tenantId;
  const { error, value } = createTicketTypeSchema.validate(request.body);

  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { eventService, pricingService } = request.container.cradle;

  try {
    // Verify event exists and user has access
    await eventService.getEvent(id, tenantId);

    // Create pricing tier (ticket type)
    const ticketType = await pricingService.createPricing({
      event_id: id,
      ...value,
      is_active: true,
      is_visible: true
    }, tenantId);

    return reply.status(201).send({
      success: true,
      data: ticketType
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error creating ticket type:', error);
    throw error;
  }
};

export const updateTicketType: AuthenticatedHandler = async (request, reply) => {
  const { id, typeId } = request.params as { id: string; typeId: string };
  const tenantId = (request as any).tenantId;
  const { error, value } = updateTicketTypeSchema.validate(request.body);

  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { db, eventService, pricingService } = request.container.cradle;

  try {
    // Verify event exists and user has access
    await eventService.getEvent(id, tenantId);

    const pricingModel = new EventPricingModel(db);

    // Check if pricing exists and belongs to this event
    const pricing = await pricingModel.findById(typeId);

    if (!pricing || pricing.event_id !== id || pricing.tenant_id !== tenantId) {
      return reply.status(404).send({
        success: false,
        error: 'Ticket type not found',
        code: 'NOT_FOUND'
      });
    }

    // MEDIUM PRIORITY FIX for Issue #11: Check if tickets have been sold before allowing price changes
    // TODO: Implement service-to-service call to ticket-service to check sold count
    // Example implementation:
    //   const ticketService = container.resolve('ticketService');
    //   const soldCount = await ticketService.getSoldCount(id, typeId);
    //   if (soldCount > 0 && value.base_price && value.base_price !== pricing.base_price) {
    //     throw createProblemError(400, 'TICKETS_SOLD', 'Cannot change price after tickets have been sold');
    //   }
    
    // For now, check if price is being changed and add warning in response
    const isPriceChanging = value.base_price && value.base_price !== pricing.base_price;
    
    const updated = await pricingService.updatePricing(typeId, value, tenantId);
    
    // Add warning if price was changed
    if (isPriceChanging) {
      return reply.send({
        success: true,
        data: updated,
        warning: 'Price updated. TODO: Verify no tickets have been sold via ticket-service before allowing price changes.'
      });
    }

    return reply.send({
      success: true,
      data: updated
    });
  } catch (error: any) {
    if (error.message === 'Event not found' || error.message === 'Pricing not found') {
      return reply.status(404).send({
        success: false,
        error: error.message,
        code: 'NOT_FOUND'
      });
    }
    request.log.error('Error updating ticket type:', error);
    throw error;
  }
};

export const getTicketType: AuthenticatedHandler = async (request, reply) => {
  const { id, typeId } = request.params as { id: string; typeId: string };
  const tenantId = (request as any).tenantId;
  const { db, eventService } = request.container.cradle;

  try {
    await eventService.getEvent(id, tenantId);

    const pricingModel = new EventPricingModel(db);
    const pricing = await pricingModel.findById(typeId);

    if (!pricing || pricing.event_id !== id || pricing.tenant_id !== tenantId) {
      return reply.status(404).send({
        success: false,
        error: 'Ticket type not found',
        code: 'NOT_FOUND'
      });
    }

    return reply.send({
      success: true,
      data: pricing
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error getting ticket type:', error);
    throw error;
  }
};
