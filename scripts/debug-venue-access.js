#!/usr/bin/env node

const axios = require('axios');

async function debug() {
  const loginResponse = await axios.post('http://localhost:3001/auth/login', {
    email: 'phase1test@example.com',
    password: 'TestPassword123!'
  });
  const token = loginResponse.data.data.tokens.accessToken;
  
  // Create a venue
  const venueResponse = await axios.post(
    'http://localhost:3002/api/v1/venues',
    {
      name: `Debug Venue ${Date.now()}`,
      type: 'theater',
      capacity: 1000,
      address: {
        street: '123 Debug St',
        city: 'Debug City',
        state: 'DC',
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
  
  const venueId = venueResponse.data.id;
  console.log('Created venue:', venueId);
  
  // Now try to access it
  try {
    const getResponse = await axios.get(
      `http://localhost:3002/api/v1/venues/${venueId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    console.log('Can access venue:', getResponse.status === 200);
  } catch (error) {
    console.log('Cannot access venue:', error.response?.status, error.response?.data);
  }
}

debug();
