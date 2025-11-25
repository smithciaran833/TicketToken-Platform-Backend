// TicketToken JavaScript SDK - Node.js Example

const { TicketToken } = require('../dist/index');

// Initialize the SDK
const client = new TicketToken({
  apiKey: process.env.TICKETTOKEN_API_KEY || 'your-api-key-here',
  environment: 'development',
  debug: true
});

async function main() {
  try {
    console.log('🎫 TicketToken SDK Node.js Example\n');

    // Example 1: List events
    console.log('📋 Fetching events...');
    const events = await client.events.list({ limit: 5 });
    console.log(`Found ${events.data.length} events`);
    console.log(events.data.map(e => `- ${e.name}`).join('\n'));
    console.log();

    // Example 2: Get a single event
    if (events.data.length > 0) {
      const eventId = events.data[0].id;
      console.log(`🔍 Fetching event details for ${eventId}...`);
      const event = await client.events.get(eventId);
      console.log(`Event: ${event.name}`);
      console.log(`Date: ${event.date}`);
      console.log(`Venue: ${event.venue}`);
      console.log();
    }

    // Example 3: Get my tickets
    console.log('🎟️ Fetching my tickets...');
    const myTickets = await client.tickets.getMyTickets();
    console.log(`You have ${myTickets.data.length} tickets`);
    console.log();

    // Example 4: Purchase tickets (commented out to avoid actual charges)
    /*
    console.log('💳 Purchasing tickets...');
    const newTickets = await client.tickets.purchase({
      eventId: 'evt_123',
      ticketType: 'general-admission',
      quantity: 2,
      paymentMethod: 'card'
    });
    console.log(`Successfully purchased ${newTickets.length} tickets`);
    */

    // Example 5: Get current user
    console.log('👤 Fetching current user profile...');
    const user = await client.users.me();
    console.log(`User: ${user.name} (${user.email})`);
    console.log();

    // Example 6: Update config dynamically
    console.log('⚙️ Updating configuration...');
    client.setEnvironment('staging');
    console.log('Environment switched to staging');
    
    client.setDebug(false);
    console.log('Debug mode disabled');
    console.log();

    console.log('✅ All examples completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run examples
if (require.main === module) {
  main();
}

module.exports = { client };
