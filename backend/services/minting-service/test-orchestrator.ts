import { MintingOrchestrator } from './src/services/MintingOrchestrator';
import { initializeSolana } from './src/config/solana';
import dotenv from 'dotenv';

dotenv.config();

async function testOrchestrator() {
  console.log('🧪 Testing MintingOrchestrator end-to-end...\n');

  // Initialize Solana connection first
  await initializeSolana();

  const orchestrator = new MintingOrchestrator();

  try {
    const result = await orchestrator.mintCompressedNFT({
      ticketId: `ticket-${Date.now()}`,
      orderId: `order-${Date.now()}`,
      eventId: 'event-123',
      tenantId: 'tenant-456',
      metadata: {
        eventName: 'Solana Summer Fest 2025',
        eventDate: '2025-07-15',
        venue: 'Crypto Arena',
        tier: 'VIP',
        seatNumber: 'A-101'
      }
    });

    console.log('\n✅ Orchestrator mint successful!');
    console.log(JSON.stringify(result, null, 2));

  } catch (error: any) {
    console.error('❌ Orchestrator test failed:', error.message);
  }
}

testOrchestrator();
