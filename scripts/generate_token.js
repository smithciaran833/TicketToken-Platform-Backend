const jwt = require('jsonwebtoken');

const payload = {
  userId: '11111111-1111-1111-1111-111111111111',
  venueId: '11111111-1111-1111-1111-111111111111',
  venueName: 'Test Venue',
  role: 'admin',
  permissions: ['analytics.read']
};

const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '1h' });
console.log('Token:', token);
