import * as Joi from 'joi';

/**
 * SECURITY FIX (SD6): Define explicit credential schemas per provider
 * Removed .unknown(true) to prevent arbitrary properties that could be security risks
 */

// Provider-specific credential schemas
const stripeCredentialsSchema = Joi.object({
  apiKey: Joi.string().required(),
  secretKey: Joi.string().required(),
  webhookSecret: Joi.string(),
  accountId: Joi.string()
}).options({ stripUnknown: true });

const squareCredentialsSchema = Joi.object({
  accessToken: Joi.string().required(),
  applicationId: Joi.string().required(),
  locationId: Joi.string(),
  environment: Joi.string().valid('sandbox', 'production')
}).options({ stripUnknown: true });

const toastCredentialsSchema = Joi.object({
  clientId: Joi.string().required(),
  clientSecret: Joi.string().required(),
  restaurantGuid: Joi.string()
}).options({ stripUnknown: true });

const mailchimpCredentialsSchema = Joi.object({
  apiKey: Joi.string().required(),
  serverPrefix: Joi.string().required(), // e.g., 'us1'
  listId: Joi.string()
}).options({ stripUnknown: true });

const twilioCredentialsSchema = Joi.object({
  accountSid: Joi.string().required(),
  authToken: Joi.string().required(),
  phoneNumber: Joi.string()
}).options({ stripUnknown: true });

// Map provider to credential schema
const credentialSchemaMap: Record<string, Joi.ObjectSchema> = {
  stripe: stripeCredentialsSchema,
  square: squareCredentialsSchema,
  toast: toastCredentialsSchema,
  mailchimp: mailchimpCredentialsSchema,
  twilio: twilioCredentialsSchema
};

// SECURITY FIX (RD7): Add maxItems constraint to arrays
// Provider-specific config schemas (non-sensitive settings)
const baseConfigSchema = Joi.object({
  webhookUrl: Joi.string().uri(),
  apiVersion: Joi.string().max(50),
  environment: Joi.string().valid('sandbox', 'production'),
  features: Joi.array().items(Joi.string().max(100)).max(20), // RD7: Limit array size
  enabled: Joi.boolean()
}).options({ stripUnknown: true });

export const createIntegrationSchema = {
  body: Joi.object({
    // Accept both 'provider' and 'type' for flexibility
    provider: Joi.string().valid('square', 'stripe', 'toast', 'mailchimp', 'twilio'),
    type: Joi.string().valid('square', 'stripe', 'toast', 'mailchimp', 'twilio'),
    config: baseConfigSchema,
    // Credentials validated based on provider - use conditional validation
    credentials: Joi.object().required()
  })
  .or('provider', 'type') // At least one must be present
  .custom((value, helpers) => {
    // SECURITY: Validate credentials based on provider type
    const provider = value.provider || value.type;
    const credentialSchema = credentialSchemaMap[provider];
    
    if (credentialSchema && value.credentials) {
      const { error, value: validatedCredentials } = credentialSchema.validate(value.credentials);
      if (error) {
        return helpers.error('any.custom', { 
          message: `Invalid credentials for ${provider}: ${error.message}` 
        });
      }
      // Replace with validated/stripped credentials
      value.credentials = validatedCredentials;
    }
    
    return value;
  })
  .messages({
    'object.missing': 'Either "provider" or "type" is required',
    'any.custom': '{{#message}}'
  })
};

export const updateIntegrationSchema = {
  body: Joi.object({
    config: baseConfigSchema,
    status: Joi.string().valid('active', 'inactive'),
    // For credential updates, require full credential object for the provider
    credentials: Joi.object()
  }).min(1).options({ stripUnknown: true })
};

// Export for use in other modules
export { credentialSchemaMap };
