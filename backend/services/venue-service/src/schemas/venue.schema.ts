import * as Joi from 'joi';

// Comprehensive venue types for a real ticketing platform
const VENUE_TYPES = [
  // Performance venues
  'theater',
  'concert_hall',
  'amphitheater',
  'arena',
  'stadium',
  'comedy_club',
  'nightclub',
  'bar',
  'lounge',
  'cabaret',
  
  // Conference/Convention
  'convention_center',
  'conference_center',
  'exhibition_hall',
  'trade_center',
  
  // Community venues
  'community_center',
  'church',
  'temple',
  'mosque',
  'school',
  'university',
  'library',
  
  // Outdoor venues
  'park',
  'festival_grounds',
  'fairgrounds',
  'beach',
  'outdoor_venue',
  'garden',
  
  // Sports venues
  'sports_complex',
  'gymnasium',
  'ice_rink',
  'race_track',
  
  // Cultural venues
  'museum',
  'gallery',
  'cultural_center',
  'opera_house',
  
  // Hospitality
  'restaurant',
  'hotel',
  'resort',
  'casino',
  'cruise_ship',
  
  // Other
  'warehouse',
  'studio',
  'private_venue',
  'other'
];

export const createVenueSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    type: Joi.string().valid(...VENUE_TYPES).required(),
    capacity: Joi.number().integer().min(10).max(100000).required(),
    address: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().length(2).required(),
      zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
      country: Joi.string().length(2).default('US')
    }).required()
  })
};

export const updateVenueSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(100),
    type: Joi.string().valid(...VENUE_TYPES),
    capacity: Joi.number().integer().min(10).max(100000),
    address: Joi.object({
      street: Joi.string(),
      city: Joi.string(),
      state: Joi.string().length(2),
      zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/),
      country: Joi.string().length(2)
    })
  }).min(1)
};

export const venueQuerySchema = {
  querystring: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    search: Joi.string().max(100).description('Search venues by name'),
    type: Joi.string().valid(...VENUE_TYPES),
    status: Joi.string().valid('active', 'inactive'),
    city: Joi.string().max(100).description('Filter by city'),
    state: Joi.string().length(2).uppercase().description('Filter by state (2-letter code)'),
    my_venues: Joi.boolean().description('Show only venues where user is staff'),
    sort_by: Joi.string().valid('name', 'created_at', 'capacity').default('name'),
    sort_order: Joi.string().valid('asc', 'desc').default('asc')
  })
};
