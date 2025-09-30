import { AuthenticatedHandler } from '../types';
import Joi from 'joi';

const createTicketTypeSchema = Joi.object({
  name: Joi.string().min(3).max(255).required(),
  description: Joi.string().optional(),
  base_price: Joi.number().min(0).required(),
  quantity: Joi.number().integer().min(1).required(),
  max_per_order: Joi.number().integer().min(1).max(10).default(6),
  sale_start: Joi.date().iso().optional(),
  sale_end: Joi.date().iso().optional(),
  metadata: Joi.object({
    section: Joi.string().optional(),
    rows: Joi.string().optional()
  }).unknown(true).optional()
});

export const getTicketTypes: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const { db } = request.container.cradle;

  const ticketTypes = await db('ticket_types')
    .where({ event_id: id })
    .orderBy('base_price', 'asc');

  return reply.send({
    success: true,
    data: ticketTypes
  });
};

export const createTicketType: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  
  const { error, value } = createTicketTypeSchema.validate(request.body);
  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { db, eventService } = request.container.cradle;
  
  // Verify event exists and user has access
  await eventService.getEvent(id);

  const [ticketType] = await db('ticket_types')
    .insert({
      event_id: id,
      ...value,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');

  return reply.status(201).send({
    success: true,
    data: ticketType
  });
};

export const updateTicketType: AuthenticatedHandler = async (request, reply) => {
  const { id, typeId } = request.params as { id: string; typeId: string };
  
  const { error, value } = createTicketTypeSchema.validate(request.body);
  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { db, eventService } = request.container.cradle;
  
  // Verify event exists and user has access
  await eventService.getEvent(id);

  // Check if sales have started
  const existingTickets = await db('tickets')
    .where({ ticket_type_id: typeId })
    .count('id as count')
    .first();

  const count = parseInt(existingTickets?.count as string || '0');
  
  if (count > 0) {
    // Only allow certain updates after sales begin
    const allowedUpdates = ['description', 'sale_end', 'metadata'];
    const updates = Object.keys(value).filter(key => !allowedUpdates.includes(key));
    
    if (updates.length > 0) {
      return reply.status(422).send({
        success: false,
        error: 'Cannot modify ticket type after sales begin',
        code: 'VALIDATION_ERROR',
        details: [{ field: updates.join(', '), message: 'Field cannot be modified after sales begin' }]
      });
    }
  }

  const [updated] = await db('ticket_types')
    .where({ id: typeId, event_id: id })
    .update({
      ...value,
      updated_at: new Date()
    })
    .returning('*');

  if (!updated) {
    return reply.status(404).send({
      success: false,
      error: 'Ticket type not found',
      code: 'NOT_FOUND'
    });
  }

  return reply.send({
    success: true,
    data: updated
  });
};
