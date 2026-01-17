const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

// Set test environment variables
process.env.NODE_ENV = 'test';

// Force correct DB port before any imports
process.env.DB_PORT = '5432';
process.env.DB_HOST = 'localhost';
process.env.DB_NAME = 'tickettoken_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';

console.log('Jest setup complete - DB_PORT:', process.env.DB_PORT);
