import Joi from 'joi';

export const partialRefundSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        orderItemId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).required(),
        amountCents: Joi.number().integer().min(50).required(),
      })
    )
    .min(1)
    .required(),
  reason: Joi.string().min(10).max(500).required(),
  notes: Joi.string().max(1000).optional(),
});

export const refundIdSchema = Joi.object({
  refundId: Joi.string().uuid().required(),
});
