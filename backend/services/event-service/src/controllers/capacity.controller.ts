import { AuthenticatedHandler } from '../types';
import Joi from 'joi';

const updateCapacitySchema = Joi.object({
  capacity: Joi.number().integer().min(1).required()
});

export const getCapacity: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  const { capacityService } = request.container.cradle;

  const capacity = await capacityService.getEventCapacity(id);

  return reply.send({
    success: true,
    data: capacity
  });
};

export const updateCapacity: AuthenticatedHandler = async (request, reply) => {
  const { id } = request.params as { id: string };
  
  const { error, value } = updateCapacitySchema.validate(request.body);
  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { eventService, capacityService } = request.container.cradle;
  
  // Verify event exists and user has access
  const event = await eventService.getEvent(id);
  
  // Verify user has access to venue
  const hasAccess = await request.container.cradle.venueServiceClient.validateVenueAccess(
    event.venue_id,
    request.headers.authorization!
  );
  
  if (!hasAccess) {
    return reply.status(403).send({
      success: false,
      error: 'Forbidden',
      code: 'FORBIDDEN'
    });
  }

  await capacityService.updateCapacity(id, value.capacity);

  return reply.send({
    success: true,
    data: { message: 'Capacity updated successfully' }
  });
};
