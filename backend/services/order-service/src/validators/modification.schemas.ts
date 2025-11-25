import Joi from 'joi';

export const modificationRequestSchema = Joi.object({
  modificationType: Joi.string()
    .valid('ADD_ITEM', 'REMOVE_ITEM', 'UPGRADE_ITEM', 'DOWNGRADE_ITEM', 'CHANGE_QUANTITY')
    .required(),
  originalItemId: Joi.string().uuid().optional(),
  newTicketTypeId: Joi.string().uuid().optional(),
  quantityChange: Joi.number().integer().optional(),
  reason: Joi.string().min(10).max(500).required(),
  notes: Joi.string().max(1000).optional(),
});

export const upgradeRequestSchema = Joi.object({
  originalItemId: Joi.string().uuid().required(),
  newTicketTypeId: Joi.string().uuid().required(),
  reason: Joi.string().min(10).max(500).required(),
  notes: Joi.string().max(1000).optional(),
});

export const approveModificationSchema = Joi.object({
  modificationId: Joi.string().uuid().required(),
});

export const rejectModificationSchema = Joi.object({
  modificationId: Joi.string().uuid().required(),
  reason: Joi.string().min(10).max(500).required(),
});
