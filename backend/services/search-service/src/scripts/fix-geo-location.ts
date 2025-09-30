import { Client } from '@elastic/elasticsearch';

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
});

async function fixGeoLocation() {
  console.log('Fixing geo-location mapping...');
  
  // Delete existing index if it exists
  await client.indices.delete({ index: 'events' }).catch(() => {});
  
  // Create index with proper geo_point mapping
  await client.indices.create({
    index: 'events',
    body: {
      settings: {
        analysis: {
          analyzer: {
            autocomplete: {
              type: 'custom',
              tokenizer: 'edge_ngram_tokenizer',
              filter: ['lowercase']
            },
            search_analyzer: {
              type: 'custom',
              tokenizer: 'standard'
            }
          },
          tokenizer: {
            edge_ngram_tokenizer: {
              type: 'edge_ngram',
              min_gram: 2,
              max_gram: 10,
              token_chars: ['letter', 'digit']
            }
          }
        }
      },
      mappings: {
        properties: {
          location: {
            type: 'geo_point'
          },
          name: {
            type: 'text',
            analyzer: 'autocomplete',
            search_analyzer: 'search_analyzer'
          },
          description: {
            type: 'text'
          },
          venue_id: {
            type: 'keyword'
          },
          starts_at: {
            type: 'date'
          },
          ends_at: {
            type: 'date'
          },
          status: {
            type: 'keyword'
          },
          category: {
            type: 'keyword'
          },
          tags: {
            type: 'keyword'
          },
          price_cents: {
            type: 'integer'
          },
          available_tickets: {
            type: 'integer'
          }
        }
      }
    }
  });
  
  console.log('Index created with proper geo_point mapping');
  
  // Re-index existing data
  const geoData: any = {
    '13094b8f-dc4d-4af8-8aa0-08344de50e8a': { lat: 37.7749, lon: -122.4194 },
    '60bc38a3-41fd-4aee-8cc4-490321e75929': { lat: 34.0522, lon: -118.2437 },
    'f23f0104-8b79-4e77-a7cb-a9ef3ba52d85': { lat: 40.7128, lon: -74.0060 }
  };
  
  const venues = [
    { id: '13094b8f-dc4d-4af8-8aa0-08344de50e8a', name: 'SF Venue' },
    { id: '60bc38a3-41fd-4aee-8cc4-490321e75929', name: 'LA Venue' },
    { id: 'f23f0104-8b79-4e77-a7cb-a9ef3ba52d85', name: 'NYC Venue' }
  ];
  
  for (const venue of venues) {
    await client.index({
      index: 'events',
      id: venue.id,
      body: {
        venue_id: venue.id,
        name: venue.name,
        location: (geoData as any)[venue.id] || { lat: 40.7128, lon: -74.0060 },
        status: 'active'
      }
    });
  }
  
  console.log('Data re-indexed with geo locations');
}

fixGeoLocation().catch(console.error);
