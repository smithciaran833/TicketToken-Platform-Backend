/**
 * Search Service Load Test
 * Tests search performance under various load conditions
 * 
 * Usage:
 *   npm install -g artillery
 *   artillery run tests/load/search-load-test.js
 */

module.exports = {
  config: {
    target: process.env.SEARCH_SERVICE_URL || 'http://localhost:3020',
    phases: [
      // Warm-up phase
      {
        duration: 60,
        arrivalRate: 5,
        name: 'Warm-up'
      },
      // Ramp-up phase
      {
        duration: 120,
        arrivalRate: 5,
        rampTo: 50,
        name: 'Ramp-up load'
      },
      // Sustained load
      {
        duration: 300,
        arrivalRate: 50,
        name: 'Sustained peak load'
      },
      // Stress test
      {
        duration: 120,
        arrivalRate: 50,
        rampTo: 100,
        name: 'Stress test'
      },
      // Cool down
      {
        duration: 60,
        arrivalRate: 10,
        name: 'Cool down'
      }
    ],
    payload: {
      path: './test-data.csv',
      fields: ['query', 'type', 'venueId'],
      skipHeader: true
    },
    processor: './load-test-processor.js',
    variables: {
      authToken: process.env.TEST_AUTH_TOKEN || 'test-token-123'
    },
    http: {
      timeout: 10
    },
    plugins: {
      metrics: {
        statsd: {
          host: process.env.STATSD_HOST || 'localhost',
          port: 8125,
          prefix: 'search-service.loadtest'
        }
      }
    }
  },
  scenarios: [
    {
      name: 'Basic Search Queries',
      weight: 40,
      flow: [
        {
          get: {
            url: '/api/v1/search',
            qs: {
              q: '{{ query }}',
              type: 'events',
              limit: 20
            },
            headers: {
              Authorization: 'Bearer {{ authToken }}'
            },
            capture: {
              json: '$.total',
              as: 'resultCount'
            },
            expect: [
              { statusCode: 200 },
              { contentType: 'application/json' },
              { hasProperty: 'results' }
            ]
          }
        },
        {
          think: 2
        }
      ]
    },
    {
      name: 'Autocomplete Suggestions',
      weight: 30,
      flow: [
        {
          get: {
            url: '/api/v1/search/suggest',
            qs: {
              q: '{{ query }}'
            },
            headers: {
              Authorization: 'Bearer {{ authToken }}'
            },
            expect: [
              { statusCode: 200 },
              { hasProperty: 'suggestions' }
            ]
          }
        },
        {
          think: 1
        }
      ]
    },
    {
      name: 'Geo-Location Search',
      weight: 15,
      flow: [
        {
          get: {
            url: '/api/v1/pro/near-me',
            qs: {
              lat: '{{ $randomNumber(25, 48) }}',
              lon: '{{ $randomNumber(-120, -70) }}',
              distance: '50km',
              type: 'venues'
            },
            headers: {
              Authorization: 'Bearer {{ authToken }}'
            },
            expect: [
              { statusCode: 200 }
            ]
          }
        },
        {
          think: 3
        }
      ]
    },
    {
      name: 'Advanced Search with Filters',
      weight: 10,
      flow: [
        {
          post: {
            url: '/api/v1/pro/advanced',
            headers: {
              Authorization: 'Bearer {{ authToken }}',
              'Content-Type': 'application/json'
            },
            json: {
              query: '{{ query }}',
              filters: {
                category: ['music', 'sports'],
                priceMin: 20,
                priceMax: 200,
                dateFrom: '2024-01-01',
                dateTo: '2024-12-31'
              },
              facets: ['category', 'city', 'price_range'],
              page: 1,
              limit: 20
            },
            expect: [
              { statusCode: 200 }
            ]
          }
        },
        {
          think: 4
        }
      ]
    },
    {
      name: 'Trending Searches',
      weight: 5,
      flow: [
        {
          get: {
            url: '/api/v1/pro/trending',
            headers: {
              Authorization: 'Bearer {{ authToken }}'
            },
            expect: [
              { statusCode: 200 }
            ]
          }
        },
        {
          think: 5
        }
      ]
    }
  ]
};
