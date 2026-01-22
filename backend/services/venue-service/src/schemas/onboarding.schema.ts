import * as Joi from 'joi';
import { UUID_REGEX } from './params.schema';

// Valid step IDs
const VALID_STEP_IDS = [
  'basic_info',
  'address',
  'layout',
  'payment',
  'staff'
] as const;

// Valid venue types (from venue.schema.ts)
const VENUE_TYPES = [
  'general', 'stadium', 'arena', 'theater', 'convention_center',
  'concert_hall', 'amphitheater', 'comedy_club', 'nightclub', 'bar',
  'lounge', 'cabaret', 'park', 'festival_grounds', 'outdoor_venue',
  'sports_complex', 'gymnasium', 'museum', 'gallery', 'restaurant',
  'hotel', 'other'
];

// Valid integration types
const VALID_INTEGRATION_TYPES = ['stripe', 'square'];

// Valid staff roles
const VALID_STAFF_ROLES = ['owner', 'manager', 'box_office', 'door_staff', 'viewer'];

/**
 * Route param validation for venueId
 */
export const onboardingVenueIdSchema = {
  params: Joi.object({
    venueId: Joi.string().pattern(UUID_REGEX).required()
      .messages({
        'string.pattern.base': 'venueId must be a valid UUID',
        'any.required': 'venueId is required',
      })
  }).unknown(false)
};

/**
 * Route param validation for venueId + stepId
 */
export const onboardingStepParamsSchema = {
  params: Joi.object({
    venueId: Joi.string().pattern(UUID_REGEX).required()
      .messages({
        'string.pattern.base': 'venueId must be a valid UUID',
        'any.required': 'venueId is required',
      }),
    stepId: Joi.string().valid(...VALID_STEP_IDS).required()
      .messages({
        'any.only': `stepId must be one of: ${VALID_STEP_IDS.join(', ')}`,
        'any.required': 'stepId is required',
      })
  }).unknown(false)
};

/**
 * Step 1: Basic Info payload
 */
const basicInfoSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  venue_type: Joi.string().valid(...VENUE_TYPES),
  type: Joi.string().valid(...VENUE_TYPES),
  max_capacity: Joi.number().integer().min(1).max(1000000),
  capacity: Joi.number().integer().min(1).max(1000000),
})
  .unknown(false)
  .custom((value, helpers) => {
    // Ensure venue type is provided in some form
    if (!value.type && !value.venue_type) {
      return helpers.error('any.custom', {
        message: 'Either "type" or "venue_type" must be provided'
      });
    }
    // Ensure capacity is provided in some form
    if (!value.capacity && !value.max_capacity) {
      return helpers.error('any.custom', {
        message: 'Either "capacity" or "max_capacity" must be provided'
      });
    }
    return value;
  });

/**
 * Step 2: Address payload
 */
const addressSchema = Joi.object({
  // Support both formats: nested address object OR flat fields
  address: Joi.object({
    street: Joi.string().max(255).required(),
    city: Joi.string().max(100).required(),
    state: Joi.string().max(100).required(),
    zipCode: Joi.string().max(20).required(),
    country: Joi.string().length(2).default('US')
  }),
  // Flat fields
  street: Joi.string().max(255),
  address_line1: Joi.string().max(255),
  address_line2: Joi.string().max(255).allow('', null),
  city: Joi.string().max(100),
  state: Joi.string().max(100),
  state_province: Joi.string().max(100),
  zipCode: Joi.string().max(20),
  postal_code: Joi.string().max(20),
  country: Joi.string().length(2).default('US'),
  country_code: Joi.string().length(2).default('US'),
})
  .unknown(false)
  .custom((value, helpers) => {
    const hasAddressObject = !!value.address;
    const hasFlatAddress = !!(
      (value.street || value.address_line1) &&
      value.city &&
      (value.state || value.state_province) &&
      (value.zipCode || value.postal_code)
    );

    if (!hasAddressObject && !hasFlatAddress) {
      return helpers.error('any.custom', {
        message: 'Either "address" object or flat address fields (street/address_line1, city, state/state_province, zipCode/postal_code) must be provided'
      });
    }
    return value;
  });

/**
 * Step 3: Layout payload
 */
const layoutSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  type: Joi.string().valid('fixed', 'general_admission', 'mixed').default('general_admission'),
  sections: Joi.array().items(
    Joi.object({
      id: Joi.string().max(100).required(),
      name: Joi.string().max(200).required(),
      rows: Joi.number().integer().min(1).max(1000).required(),
      seatsPerRow: Joi.number().integer().min(1).max(1000).required(),
      pricing: Joi.object({
        basePrice: Joi.number().min(0).required(),
        dynamicPricing: Joi.boolean().default(false)
      })
    })
  ).min(0).max(100),
  capacity: Joi.number().integer().min(1).max(1000000),
  max_capacity: Joi.number().integer().min(1).max(1000000),
  is_default: Joi.boolean().default(true)
}).unknown(false);

/**
 * Step 4: Payment Integration payload
 */
const paymentSchema = Joi.object({
  type: Joi.string().valid(...VALID_INTEGRATION_TYPES).required()
    .messages({
      'any.only': `Integration type must be one of: ${VALID_INTEGRATION_TYPES.join(', ')}`,
      'any.required': 'Integration type is required',
    }),
  config: Joi.object().pattern(Joi.string(), Joi.any()).default({}),
  config_data: Joi.object().pattern(Joi.string(), Joi.any()).default({}),
  credentials: Joi.object().pattern(Joi.string(), Joi.any()),
  apiKey: Joi.string().max(500),
  api_key: Joi.string().max(500),
  apiSecret: Joi.string().max(500),
  api_secret: Joi.string().max(500),
  secretKey: Joi.string().max(500),
}).unknown(false);

/**
 * Step 5: Staff payload
 */
const staffSchema = Joi.object({
  userId: Joi.string().pattern(UUID_REGEX).required()
    .messages({
      'string.pattern.base': 'userId must be a valid UUID',
      'any.required': 'userId is required',
    }),
  user_id: Joi.string().pattern(UUID_REGEX),
  role: Joi.string().valid(...VALID_STAFF_ROLES).required()
    .messages({
      'any.only': `role must be one of: ${VALID_STAFF_ROLES.join(', ')}`,
      'any.required': 'role is required',
    }),
  permissions: Joi.array().items(Joi.string().max(50)).max(50).default([]),
}).unknown(false);

/**
 * Complete step body schema - validates based on stepId
 */
export const completeStepBodySchema = {
  body: Joi.alternatives()
    .conditional(Joi.ref('$params.stepId'), {
      switch: [
        { is: 'basic_info', then: basicInfoSchema },
        { is: 'address', then: addressSchema },
        { is: 'layout', then: layoutSchema },
        { is: 'payment', then: paymentSchema },
        { is: 'staff', then: staffSchema },
      ],
      otherwise: Joi.object().unknown(false)
    })
};
