// Quick test of the built SDK
const { TicketTokenSDK } = require('./dist/index.js');

const sdk = new TicketTokenSDK({
  baseURL: 'http://localhost:3000/api/v1',
  debug: true
});

console.log('✅ SDK initialized successfully!');
console.log('Available APIs:', Object.keys(sdk).filter(k => !k.startsWith('_')));
console.log('\nAuth methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.auth)).filter(m => !m.startsWith('_') && m !== 'constructor'));
console.log('Events methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.events)).filter(m => !m.startsWith('_') && m !== 'constructor'));
console.log('Tickets methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.tickets)).filter(m => !m.startsWith('_') && m !== 'constructor'));
console.log('Payments methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.payments)).filter(m => !m.startsWith('_') && m !== 'constructor'));
