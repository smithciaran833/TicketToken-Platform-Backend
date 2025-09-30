export const SEARCH_SYNONYMS = {
  'concert': ['show', 'gig', 'performance', 'concert'],
  'theater': ['theatre', 'theater', 'playhouse'],
  'music': ['concert', 'show', 'performance'],
  'sports': ['game', 'match', 'competition'],
  'comedy': ['standup', 'stand-up', 'comic', 'humor'],
  'festival': ['fest', 'fair', 'carnival']
};

export const SEARCH_BOOSTS = {
  'name': 3.0,
  'artist': 2.5,
  'venue_name': 2.0,
  'description': 1.5,
  'category': 1.2,
  'city': 1.0
};

export const SEARCH_SETTINGS = {
  maxResults: 100,
  defaultLimit: 20,
  maxQueryLength: 200,
  cacheTimeout: 300,
  minScore: 0.3,
  fuzzyDistance: 2,
  searchAsYouTypeDelay: 300
};
