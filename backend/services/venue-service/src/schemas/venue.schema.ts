import * as Joi from 'joi';

// Comprehensive venue types
const VENUE_TYPES = [
  'general',
  'stadium',
  'arena',
  'theater',
  'convention_center',
  'concert_hall',
  'amphitheater',
  'comedy_club',
  'nightclub',
  'bar',
  'lounge',
  'cabaret',
  'park',
  'festival_grounds',
  'outdoor_venue',
  'sports_complex',
  'gymnasium',
  'museum',
  'gallery',
  'restaurant',
  'hotel',
  'other'
];

const STATUS_VALUES = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'];

// Address object schema (for backward compatibility)
const addressObjectSchema = Joi.object({
  street: Joi.string().max(255).required(),
  city: Joi.string().max(100).required(),
  state: Joi.string().max(100).required(),
  zipCode: Joi.string().max(20).required(),
  country: Joi.string().length(2).default('US')
});

export const createVenueSchema = {
  body: Joi.object({
    // ===== REQUIRED FIELDS (minimal for creation) =====
    name: Joi.string().min(2).max(200).required(),
    email: Joi.string().email().max(255).required(),
    
    // Address - accept EITHER old format (address object) OR new format (flat fields)
    // At least one format must be provided
    address: addressObjectSchema,
    address_line1: Joi.string().max(255),
    city: Joi.string().max(100),
    state_province: Joi.string().max(100),
    country_code: Joi.string().length(2).default('US'),
    
    // Capacity and type - support both old and new field names
    max_capacity: Joi.number().integer().min(1).max(1000000),
    capacity: Joi.number().integer().min(1).max(1000000),
    venue_type: Joi.string().valid(...VENUE_TYPES),
    type: Joi.string().valid(...VENUE_TYPES),

    // ===== OPTIONAL FIELDS (all 60+ additional fields) =====
    
    // Core
    slug: Joi.string().max(200).pattern(/^[a-z0-9-]+$/),
    description: Joi.string().max(5000),
    
    // Contact
    phone: Joi.string().max(20).pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/),
    website: Joi.string().uri().max(500),
    
    // Address additional
    address_line2: Joi.string().max(255),
    postal_code: Joi.string().max(20),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    timezone: Joi.string().max(50),
    
    // Capacity additional
    standing_capacity: Joi.number().integer().min(0),
    seated_capacity: Joi.number().integer().min(0),
    vip_capacity: Joi.number().integer().min(0),
    
    // Media
    logo_url: Joi.string().uri().max(1000),
    cover_image_url: Joi.string().uri().max(1000),
    image_gallery: Joi.array().items(Joi.string().uri().max(1000)).max(50),
    virtual_tour_url: Joi.string().uri().max(1000),
    
    // Business Information
    business_name: Joi.string().max(200),
    business_registration: Joi.string().max(100),
    tax_id: Joi.string().max(50),
    business_type: Joi.string().max(50),
    
    // Blockchain
    wallet_address: Joi.string().max(44).pattern(/^[A-Za-z0-9]+$/),
    collection_address: Joi.string().max(44).pattern(/^[A-Za-z0-9]+$/),
    royalty_percentage: Joi.number().min(0).max(100).precision(2),
    
    // Status
    status: Joi.string().valid(...STATUS_VALUES),
    is_verified: Joi.boolean(),
    verified_at: Joi.date().iso(),
    verification_level: Joi.string().max(20),
    
    // Features & Amenities
    features: Joi.array().items(Joi.string().max(100)).max(100),
    amenities: Joi.object().pattern(Joi.string(), Joi.any()),
    accessibility_features: Joi.array().items(Joi.string().max(100)).max(100),
    
    // Policies
    age_restriction: Joi.number().integer().min(0).max(99),
    dress_code: Joi.string().max(500),
    prohibited_items: Joi.array().items(Joi.string().max(100)).max(100),
    cancellation_policy: Joi.string().max(5000),
    refund_policy: Joi.string().max(5000),
    
    // Social & Ratings (read-only, but allow for migration purposes)
    social_media: Joi.object().pattern(Joi.string(), Joi.string().uri()),
    average_rating: Joi.number().min(0).max(5).precision(2),
    total_reviews: Joi.number().integer().min(0),
    total_events: Joi.number().integer().min(0),
    total_tickets_sold: Joi.number().integer().min(0),
    
    // Metadata
    metadata: Joi.object().pattern(Joi.string(), Joi.any()),
    tags: Joi.array().items(Joi.string().max(50)).max(50),
    
    // Legacy/Backward compatibility
    settings: Joi.object(),
    onboarding: Joi.object(),
    onboarding_status: Joi.string().valid('pending', 'in_progress', 'completed'),
    is_active: Joi.boolean()
  })
  // Custom validation to ensure either address object OR flat fields are provided
  .custom((value, helpers) => {
    const hasAddressObject = !!value.address;
    const hasFlatAddress = !!(value.address_line1 && value.city && value.state_province);
    
    if (!hasAddressObject && !hasFlatAddress) {
      return helpers.error('any.custom', { 
        message: 'Either "address" object or flat address fields (address_line1, city, state_province) must be provided' 
      });
    }
    
    // Ensure capacity is provided in some form
    if (!value.capacity && !value.max_capacity) {
      return helpers.error('any.custom', { 
        message: 'Either "capacity" or "max_capacity" must be provided' 
      });
    }
    
    // Ensure venue type is provided in some form
    if (!value.type && !value.venue_type) {
      return helpers.error('any.custom', { 
        message: 'Either "type" or "venue_type" must be provided' 
      });
    }
    
    return value;
  })
};

export const updateVenueSchema = {
  body: Joi.object({
    // Core
    name: Joi.string().min(2).max(200),
    slug: Joi.string().max(200).pattern(/^[a-z0-9-]+$/),
    description: Joi.string().max(5000).allow('', null),
    
    // Contact
    email: Joi.string().email().max(255),
    phone: Joi.string().max(20).pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/).allow('', null),
    website: Joi.string().uri().max(500).allow('', null),
    
    // Address - support both formats
    address: addressObjectSchema,
    address_line1: Joi.string().max(255),
    address_line2: Joi.string().max(255).allow('', null),
    city: Joi.string().max(100),
    state_province: Joi.string().max(100),
    postal_code: Joi.string().max(20).allow('', null),
    country_code: Joi.string().length(2),
    latitude: Joi.number().min(-90).max(90).allow(null),
    longitude: Joi.number().min(-180).max(180).allow(null),
    timezone: Joi.string().max(50),
    
    // Venue type
    venue_type: Joi.string().valid(...VENUE_TYPES),
    type: Joi.string().valid(...VENUE_TYPES),
    
    // Capacity
    max_capacity: Joi.number().integer().min(1).max(1000000),
    capacity: Joi.number().integer().min(1).max(1000000),
    standing_capacity: Joi.number().integer().min(0).allow(null),
    seated_capacity: Joi.number().integer().min(0).allow(null),
    vip_capacity: Joi.number().integer().min(0).allow(null),
    
    // Media
    logo_url: Joi.string().uri().max(1000).allow('', null),
    cover_image_url: Joi.string().uri().max(1000).allow('', null),
    image_gallery: Joi.array().items(Joi.string().uri().max(1000)).max(50),
    virtual_tour_url: Joi.string().uri().max(1000).allow('', null),
    
    // Business
    business_name: Joi.string().max(200).allow('', null),
    business_registration: Joi.string().max(100).allow('', null),
    tax_id: Joi.string().max(50).allow('', null),
    business_type: Joi.string().max(50).allow('', null),
    
    // Blockchain
    wallet_address: Joi.string().max(44).pattern(/^[A-Za-z0-9]+$/).allow('', null),
    collection_address: Joi.string().max(44).pattern(/^[A-Za-z0-9]+$/).allow('', null),
    royalty_percentage: Joi.number().min(0).max(100).precision(2).allow(null),
    
    // Status
    status: Joi.string().valid(...STATUS_VALUES),
    is_active: Joi.boolean(),
    is_verified: Joi.boolean(),
    verified_at: Joi.date().iso().allow(null),
    verification_level: Joi.string().max(20).allow('', null),
    
    // Features
    features: Joi.array().items(Joi.string().max(100)).max(100),
    amenities: Joi.object().pattern(Joi.string(), Joi.any()),
    accessibility_features: Joi.array().items(Joi.string().max(100)).max(100),
    
    // Policies
    age_restriction: Joi.number().integer().min(0).max(99).allow(null),
    dress_code: Joi.string().max(500).allow('', null),
    prohibited_items: Joi.array().items(Joi.string().max(100)).max(100),
    cancellation_policy: Joi.string().max(5000).allow('', null),
    refund_policy: Joi.string().max(5000).allow('', null),
    
    // Social
    social_media: Joi.object().pattern(Joi.string(), Joi.string().uri()),
    
    // Metadata
    metadata: Joi.object().pattern(Joi.string(), Joi.any()),
    tags: Joi.array().items(Joi.string().max(50)).max(50),
    
    // Legacy
    settings: Joi.object(),
    onboarding: Joi.object(),
    onboarding_status: Joi.string().valid('pending', 'in_progress', 'completed')
  }).min(1) // At least one field must be provided for update
};

export const venueQuerySchema = {
  querystring: Joi.object({
    // Pagination
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    
    // Search
    search: Joi.string().max(100).description('Search venues by name or city'),
    
    // Filters
    type: Joi.string().valid(...VENUE_TYPES).description('Filter by venue type'),
    venue_type: Joi.string().valid(...VENUE_TYPES).description('Filter by venue type'),
    status: Joi.string().valid(...STATUS_VALUES).description('Filter by status'),
    city: Joi.string().max(100).description('Filter by city'),
    state: Joi.string().max(100).description('Filter by state'),
    country: Joi.string().length(2).description('Filter by country code'),
    is_verified: Joi.boolean().description('Filter by verification status'),
    
    // Capacity filters
    min_capacity: Joi.number().integer().min(0).description('Minimum capacity'),
    max_capacity_filter: Joi.number().integer().min(0).description('Maximum capacity'),
    
    // Feature filters
    features: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).description('Filter by features'),
    
    // Special filters
    my_venues: Joi.boolean().description('Show only venues where user is staff'),
    
    // Sorting
    sort_by: Joi.string().valid('name', 'created_at', 'capacity', 'rating', 'total_events').default('name'),
    sort_order: Joi.string().valid('asc', 'desc').default('asc')
  })
};

// Venue ID parameter schema
export const venueIdSchema = {
  params: Joi.object({
    venueId: Joi.string().uuid().required()
  })
};
