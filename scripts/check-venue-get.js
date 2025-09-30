#!/usr/bin/env node

const axios = require('axios');

console.log('=== Checking GET Venue Endpoint ===\n');

async function check() {
  try {
    // Get auth token
    const loginResponse = await axios.post('http://localhost:3001/auth/login', {
      email: 'phase1test@example.com',
      password: 'TestPassword123!'
    });
    const token = loginResponse.data.data.tokens.accessToken;
    
    // Use the venue we just created in L2.1-007
    const venueId = '4b3c03d1-07fb-48fb-858a-76f737a45856';
    
    console.log('1. Testing GET with valid venue ID...');
    console.log(`   GET http://localhost:3002/api/v1/venues/${venueId}`);
    
    const response = await axios.get(
      `http://localhost:3002/api/v1/venues/${venueId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('\n2. Response structure:');
    console.log('   Status:', response.status);
    console.log('   Has wrapped data?:', response.data.data !== undefined);
    console.log('   Direct venue data?:', response.data.id !== undefined);
    console.log('\n3. What fields are returned:');
    console.log('   Fields:', Object.keys(response.data).join(', '));
    
    console.log('\n4. Testing without auth...');
    try {
      await axios.get(`http://localhost:3002/api/v1/venues/${venueId}`);
      console.log('   No auth required');
    } catch (error) {
      console.log('   Auth required:', error.response?.status);
    }
    
    console.log('\n5. Testing non-existent venue...');
    try {
      await axios.get(
        'http://localhost:3002/api/v1/venues/00000000-0000-0000-0000-000000000000',
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      console.log('   Returns data for non-existent');
    } catch (error) {
      console.log('   Returns:', error.response?.status);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();
