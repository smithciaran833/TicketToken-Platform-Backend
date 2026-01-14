// Jest setup for auth-service tests
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

// Set test environment variables
process.env.NODE_ENV = 'test';
