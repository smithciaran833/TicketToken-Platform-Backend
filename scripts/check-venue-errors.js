#!/usr/bin/env node

const axios = require('axios');

console.log('=== Investigating 403 vs 404 ===\n');

async function check() {
  try {
    const loginResponse = await axios.post('http://localhost:3001/auth/login', {
      email: 'phase1test@example.com',
      password: 'TestPassword123!'
    });
    const token = loginResponse.data.data.tokens.accessToken;
    
    // Try a few non-existent IDs
    const testIds = [
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '12345678-1234-1234-1234-123456789012'
    ];
    
    for (const id of testIds) {
      try {
        await axios.get(
          `http://localhost:3002/api/v1/venues/${id}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        console.log(`${id}: Got data (shouldn't happen)`);
      } catch (error) {
        console.log(`${id}: ${error.response?.status} ${error.response?.statusText}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();
