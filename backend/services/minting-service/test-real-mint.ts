import { RealCompressedNFT } from './src/services/RealCompressedNFT';
import dotenv from 'dotenv';

dotenv.config();

async function testMint() {
  console.log('🧪 Testing real compressed NFT mint on devnet...\n');

  const nftService = new RealCompressedNFT();
  
  try {
    await nftService.initialize();
    
    const result = await nftService.mintNFT({
      ticketId: `test-ticket-${Date.now()}`,
      metadata: {
        name: 'Test Event Ticket #1',
        uri: 'https://gateway.pinata.cloud/ipfs/QmYGS9vrAKEHHLbcP2EQ8X86oiwnVHTCqEZRUTYqnHWAcV'
      }
    });

    console.log('\n✅ Mint successful!');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error: any) {
    console.error('❌ Mint failed:', error.message);
    if (error.logs) {
      console.error('Logs:', error.logs);
    }
  }
}

testMint();
