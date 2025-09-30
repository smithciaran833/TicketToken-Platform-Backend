import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

async function optimizeIndices() {
  try {
    const indices = ['venues', 'events', 'tickets', 'marketplace'];
    
    for (const index of indices) {
      // Force merge to optimize
      await client.indices.forcemerge({
        index: index,
        max_num_segments: 1
      });
      
      // Update refresh interval for better performance
      await client.indices.putSettings({
        index: index,
        body: {
          index: {
            refresh_interval: '5s', // Reduce from default 1s
            number_of_replicas: 0 // For single node
          }
        }
      });
      
      logger.info(`Optimized ${index}`);
    }
    
    // Clear cache
    await client.indices.clearCache({
      index: indices.join(',')
    });
    
    logger.info('✅ All indices optimized');
    process.exit(0);
  } catch (error) {
    logger.error('Optimization failed:', error);
    process.exit(1);
  }
}

optimizeIndices();
