import TicketTokenSDK from '@tickettoken/sdk';

// Initialize SDK
const sdk = new TicketTokenSDK({
  baseURL: 'http://localhost:3000/api/v1',
  debug: true,
  onTokenRefresh: (tokens) => {
    // Save tokens to localStorage or secure storage
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  }
});

async function example() {
  try {
    // Login
    const { user, token } = await sdk.login('user@example.com', 'password123');
    console.log('Logged in as:', user.email);

    // Get events
    const events = await sdk.events.getEvents(1, 20);
    console.log('Events:', events.data);

    // Get specific event
    const event = await sdk.events.getEventById('event-id-here');
    console.log('Event details:', event.data);

    // Create a ticket purchase
    const ticket = await sdk.tickets.createTicket({
      eventId: 'event-id',
      quantity: 2
    });
    console.log('Ticket created:', ticket.data);

    // Mint ticket as NFT
    const mintResult = await sdk.tickets.mintTicketNFT('ticket-id', {
      walletAddress: '0x...'
    });
    console.log('NFT minted:', mintResult.data);

  } catch (error) {
    console.error('Error:', error);
  }
}

example();
