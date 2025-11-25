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

    // Note: In production, you'd want to check if tickets have been sold
    // via the ticket service before allowing certain updates
    // For now, we'll allow all updates

    const updated = await pricingService.updatePricing(typeId, value, tenantId);

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
