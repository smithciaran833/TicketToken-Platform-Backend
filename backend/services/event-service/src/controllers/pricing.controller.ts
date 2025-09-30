import { AuthenticatedHandler } from '../types';
import Joi from 'joi';

const createPricingRuleSchema = Joi.object({
  ticket_type_id: Joi.string().uuid().required(),
  rule_type: Joi.string().valid('time_based', 'demand_based', 'group').required(),
  conditions: Joi.object().required(),
  adjustment: Joi.object({
    type: Joi.string().valid('percentage', 'fixed').required(),
    value: Joi.number().required()
  }).required(),
  priority: Joi.number().integer().min(0).default(0),
  active: Joi.boolean().default(true)
});

export const getPricingRules: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const { db, eventService } = request.container.cradle;

  // Verify event exists
  await eventService.getEvent(id);

  const rules = await db('pricing_rules')
    .join('ticket_types', 'pricing_rules.ticket_type_id', 'ticket_types.id')
    .where('ticket_types.event_id', id)
    .select('pricing_rules.*', 'ticket_types.name as ticket_type_name')
    .orderBy('pricing_rules.priority', 'asc');

  return reply.send({
    success: true,
    data: rules
  });
};

export const createPricingRule: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  
  const { error, value } = createPricingRuleSchema.validate(request.body);
  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { eventService, pricingService } = request.container.cradle;
  
  // Verify event exists and user has access
  await eventService.getEvent(id);

  const rule = await pricingService.createPricingRule(value);

  return reply.status(201).send({
    success: true,
    data: rule
  });
};

export const calculatePricing: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const { db, eventService, pricingService } = request.container.cradle;

  // Verify event exists
  await eventService.getEvent(id);

  // Get all ticket types for event
  const ticketTypes = await db('ticket_types')
    .where({ event_id: id });

  // Calculate current price for each ticket type
  const pricing = await Promise.all(
    ticketTypes.map(async (ticketType) => {
      const currentPrice = await pricingService.calculatePrice(ticketType.id);
      return {
        ticket_type_id: ticketType.id,
        ticket_type_name: ticketType.name,
        base_price: ticketType.base_price,
        current_price: currentPrice,
        difference: currentPrice - ticketType.base_price,
        percentage_change: ((currentPrice - ticketType.base_price) / ticketType.base_price) * 100
      };
    })
  );

  return reply.send({
    success: true,
    data: pricing
  });
};
