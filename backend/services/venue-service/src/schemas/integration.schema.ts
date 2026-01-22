import * as Joi from 'joi';

/**
 * SECURITY FIX (SD6): Define explicit credential schemas per provider
 * Removed .unknown(true) to prevent arbitrary properties that could be security risks
 * SECURITY FIX: Added max length constraints to all credential fields
 */

// Provider-specific credential schemas
const stripeCredentialsSchema = Joi.object({
  apiKey: Joi.string().max(500).required(),
  secretKey: Joi.string().max(500).required(),
  webhookSecret: Joi.string().max(500),
  accountId: Joi.string().max(500)
}).options({ stripUnknown: true });

const squareCredentialsSchema = Joi.object({
  accessToken: Joi.string().max(500).required(),
  applicationId: Joi.string().max(500).required(),
  locationId: Joi.string().max(500),
  environment: Joi.string().valid('sandbox', 'production')
}).options({ stripUnknown: true });

const toastCredentialsSchema = Joi.object({
  clientId: Joi.string().max(500).required(),
  clientSecret: Joi.string().max(500).required(),
  restaurantGuid: Joi.string().max(500)
}).options({ stripUnknown: true });

const mailchimpCredentialsSchema = Joi.object({
  apiKey: Joi.string().max(500).required(),
  serverPrefix: Joi.string().max(50).required(), // e.g., 'us1'
  listId: Joi.string().max(500)
}).options({ stripUnknown: true });

const twilioCredentialsSchema = Joi.object({
  accountSid: Joi.string().max(500).required(),
  authToken: Joi.string().max(500).required(),
  phoneNumber: Joi.string().max(50)
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
    // SECURITY FIX: Provider-specific credential validation on updates
    // Provider/type optional but required if updating credentials
    provider: Joi.string().valid('square', 'stripe', 'toast', 'mailchimp', 'twilio'),
    type: Joi.string().valid('square', 'stripe', 'toast', 'mailchimp', 'twilio'),
    credentials: Joi.object()
  })
  .min(1)
  .custom((value, helpers) => {
    // SECURITY: If credentials are being updated, validate them based on provider
    if (value.credentials && Object.keys(value.credentials).length > 0) {
      const provider = value.provider || value.type;
      
      if (!provider) {
        return helpers.error('any.custom', { 
          message: 'Provider or type must be specified when updating credentials' 
        });
      }
      
      const credentialSchema = credentialSchemaMap[provider];
      
      if (credentialSchema) {
        const { error, value: validatedCredentials } = credentialSchema.validate(value.credentials);
        if (error) {
          return helpers.error('any.custom', { 
            message: `Invalid credentials for ${provider}: ${error.message}` 
          });
        }
        // Replace with validated/stripped credentials
        value.credentials = validatedCredentials;
      }
    }
    
    return value;
  })
  .messages({
    'any.custom': '{{#message}}'
  })
  .options({ stripUnknown: true })
};

// Export for use in other modules
export { credentialSchemaMap };
