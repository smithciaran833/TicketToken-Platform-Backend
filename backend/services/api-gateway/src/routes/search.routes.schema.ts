export const searchSchemas = {
  globalSearch: {
    tags: ['search'],
    summary: 'Global search across all entities',
    description: 'Search venues, events, tickets, and marketplace listings',
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query' },
        type: { type: 'string', enum: ['venues', 'events', 'tickets', 'marketplace'] },
        limit: { type: 'number', default: 20 },
        page: { type: 'number', default: 1 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          total: { type: 'number' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                id: { type: 'string' },
                score: { type: 'number' },
                data: { type: 'object' }
              }
            }
          }
        }
      }
    }
  },
  
  autocomplete: {
    tags: ['search'],
    summary: 'Autocomplete suggestions',
    description: 'Get search suggestions as you type',
    querystring: {
      type: 'object',
      required: ['q'],
      properties: {
        q: { type: 'string', description: 'Partial search query (min 2 chars)' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }
};
