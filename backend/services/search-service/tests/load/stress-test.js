/**
 * Stress Test Configuration
 * Tests search service under extreme load conditions
 * 
 * Usage:
 *   artillery run tests/load/stress-test.js
 */

module.exports = {
  config: {
    target: process.env.SEARCH_SERVICE_URL || 'http://localhost:3020',
    phases: [
      // Spike test - sudden traffic spike
      {
        duration: 30,
        arrivalRate: 1,
        name: 'Baseline'
      },
      {
        duration: 60,
        arrivalRate: 200,
        name: 'Traffic spike'
      },
      {
        duration: 30,
        arrivalRate: 1,
        name: 'Recovery'
      },
      // Sustained stress
      {
        duration: 300,
        arrivalRate: 150,
        name: 'Sustained high load'
      },
      // Breaking point test
      {
        duration: 180,
        arrivalRate: 150,
        rampTo: 300,
        name: 'Find breaking point'
      }
    ],
    processor: './load-test-processor.js',
    variables: {
      authToken: process.env.TEST_AUTH_TOKEN || 'test-token-123'
    },
    http: {
      timeout: 15
    }
  },
  scenarios: [
    {
      name: 'Concurrent Complex Searches',
      weight: 100,
      flow: [
        {
          function: 'generateTestToken'
        },
        {
          function: 'generateSearchQuery'
        },
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
                category: ['music', 'sports', 'theater'],
                priceMin: 10,
                priceMax: 500,
                dateFrom: '2024-01-01',
                dateTo: '2024-12-31'
              },
              facets: ['category', 'city', 'venue', 'price_range'],
              sort: 'relevance',
              page: 1,
              limit: 50
            },
            afterResponse: 'logResponseTime',
            expect: [
              { statusCode: [200, 429, 503] }
            ]
          }
        }
      ]
    }
  ]
};
