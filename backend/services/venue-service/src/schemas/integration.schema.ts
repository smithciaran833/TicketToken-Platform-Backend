import * as Joi from 'joi';

export const createIntegrationSchema = {
  body: Joi.object({
    // Accept both 'provider' and 'type' for flexibility
    provider: Joi.string().valid('square', 'stripe', 'toast', 'mailchimp', 'twilio'),
    type: Joi.string().valid('square', 'stripe', 'toast', 'mailchimp', 'twilio'),
    config: Joi.object({
      webhookUrl: Joi.string().uri(),
      apiVersion: Joi.string(),
      environment: Joi.string().valid('sandbox', 'production'),
      features: Joi.array().items(Joi.string())
    }).unknown(true), // Allow provider-specific config
    credentials: Joi.object().unknown(true).required()
  })
  .or('provider', 'type') // At least one must be present
  .messages({
    'object.missing': 'Either "provider" or "type" is required'
  })
};

export const updateIntegrationSchema = {
  body: Joi.object({
    config: Joi.object().unknown(true),
    status: Joi.string().valid('active', 'inactive')
  }).min(1)
};
