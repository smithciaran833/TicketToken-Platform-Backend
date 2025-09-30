import Joi from 'joi';

export const ticketSchemas = {
  purchaseTickets: Joi.object({
    userId: Joi.string().uuid().required(),
    eventId: Joi.string().uuid().required(),
    tickets: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        seatNumbers: Joi.array().items(Joi.string()).optional()
      })
    ).min(1).required(),
    paymentIntentId: Joi.string().optional(),
    metadata: Joi.object().optional()
  }),

  createTicketType: Joi.object({
    eventId: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).optional(),
    price: Joi.number().min(0).required(),
    quantity: Joi.number().integer().min(1).required(),
    maxPerPurchase: Joi.number().integer().min(1).max(10).required(),
    saleStartDate: Joi.date().iso().required(),
    saleEndDate: Joi.date().iso().greater(Joi.ref('saleStartDate')).required(),
    metadata: Joi.object().optional()
  }),

  transferTicket: Joi.object({
    ticketId: Joi.string().uuid().required(),
    toUserId: Joi.string().uuid().required(),
    reason: Joi.string().max(200).optional()
  }),

  validateQR: Joi.object({
    qrCode: Joi.string().required(),
    eventId: Joi.string().uuid().required(),
    entrance: Joi.string().optional(),
    deviceId: Joi.string().optional()
  })
};

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }
    next();
  };
};
