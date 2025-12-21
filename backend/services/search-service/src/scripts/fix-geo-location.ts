import { Client } from '@elastic/elasticsearch';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
});

// Load mapping files from database/elasticsearch/mappings/
function loadMapping(filename: string): any {
  const mappingPath = join(__dirname, '../../../../../../database/elasticsearch/mappings', filename);
  const mappingContent = readFileSync(mappingPath, 'utf-8');
  return JSON.parse(mappingContent);
}

async function fixGeoLocation() {
  console.log('Fixing geo-location mapping for events and venues...');
  
  try {
    // Load full mappings
    const eventsMapping = loadMapping('events_mapping.json');
    const venuesMapping = loadMapping('venues_mapping.json');

    // Delete existing events index if it exists
    await client.indices.delete({ index: 'events' }).catch(() => {
      console.log('Events index does not exist, creating new...');
    });
    
    // Delete existing venues index if it exists
    await client.indices.delete({ index: 'venues' }).catch(() => {
      console.log('Venues index does not exist, creating new...');
    });
    
    // Create events index with full mapping from JSON file
    await client.indices.create({
      index: 'events',
      body: eventsMapping
    });
    console.log('✅ Events index created with full mapping including proper geo_point');
    
    // Create venues index with full mapping from JSON file
    await client.indices.create({
      index: 'venues',
      body: venuesMapping
    });
    console.log('✅ Venues index created with full mapping including proper geo_point');
    
    // Re-index sample data for testing
    const sampleVenues = [
      {
        venueId: '13094b8f-dc4d-4af8-8aa0-08344de50e8a',
        name: 'San Francisco Concert Hall',
        location: { lat: 37.7749, lon: -122.4194 },
        address: {
          city: 'San Francisco',
          state: 'CA',
          country: 'USA'
        },
        status: 'active'
      },
      {
        venueId: '60bc38a3-41fd-4aee-8cc4-490321e75929',
        name: 'Los Angeles Arena',
        location: { lat: 34.0522, lon: -118.2437 },
        address: {
          city: 'Los Angeles',
          state: 'CA',
          country: 'USA'
        },
        status: 'active'
      },
      {
        venueId: 'f23f0104-8b79-4e77-a7cb-a9ef3ba52d85',
        name: 'New York Theatre',
        location: { lat: 40.7128, lon: -74.0060 },
        address: {
          city: 'New York',
          state: 'NY',
          country: 'USA'
        },
        status: 'active'
      }
    ];
    
    for (const venue of sampleVenues) {
      await client.index({
        index: 'venues',
        id: venue.venueId,
        body: venue
      });
    }
    
    console.log('✅ Sample venues indexed with geo locations');
    console.log('');
    console.log('📊 Summary:');
    console.log('  - Events index recreated with ~50 fields (including venue.location geo_point)');
    console.log('  - Venues index recreated with ~60 fields (including location geo_point)');
    console.log('  - Sample venues indexed for testing geo-distance queries');
    console.log('');
    console.log('🔍 Test geo query:');
    console.log('  GET /venues/_search');
    console.log('  {');
    console.log('    "query": {');
    console.log('      "geo_distance": {');
    console.log('        "distance": "50km",');
    console.log('        "location": { "lat": 37.7749, "lon": -122.4194 }');
    console.log('      }');
    console.log('    }');
    console.log('  }');
  } catch (error) {
    console.error('Failed to fix geo-location:', error);
    throw error;
  }
}

fixGeoLocation().catch(console.error);
