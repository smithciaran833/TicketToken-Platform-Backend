#!/usr/bin/env node

const axios = require('axios');

console.log('=== Debug Venue Creation Response ===\n');

async function debug() {
  try {
    // Get auth token
    const loginResponse = await axios.post('http://localhost:3001/auth/login', {
      email: 'phase1test@example.com',
      password: 'TestPassword123!'
    });
    const token = loginResponse.data.data.tokens.accessToken;
    console.log('Token obtained\n');

    // Create venue and see FULL response
    console.log('Creating venue and examining response...\n');
    const createResponse = await axios.post(
      'http://localhost:3002/api/v1/venues',
      {
        name: `Test Venue ${Date.now()}`,
        type: 'theater',
        capacity: 1000,
        address: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Full response structure:');
    console.log(JSON.stringify(createResponse.data, null, 2));
    
    // Try different paths to find the ID
    console.log('\nLooking for ID in different places:');
    console.log('createResponse.data.id:', createResponse.data.id);
    console.log('createResponse.data.data:', createResponse.data.data);
    console.log('createResponse.data.data?.id:', createResponse.data.data?.id);
    console.log('createResponse.data.venue?.id:', createResponse.data.venue?.id);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

debug();
