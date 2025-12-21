import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

// Load mapping files from database/elasticsearch/mappings/
function loadMapping(filename: string): any {
  const mappingPath = join(__dirname, '../../../../../../database/elasticsearch/mappings', filename);
  const mappingContent = readFileSync(mappingPath, 'utf-8');
  return JSON.parse(mappingContent);
}

interface ReindexOptions {
  indexName: string;
  mappingFile: string;
  aliasName?: string;
}

/**
 * Zero-downtime reindexing using aliases
 * 1. Create new index with version suffix (e.g., venues_v2)
 * 2. Apply full mapping from JSON file
 * 3. Reindex data from old index to new index
 * 4. Update alias to point to new index
 * 5. Delete old index
 */
async function reindexWithAlias(options: ReindexOptions) {
  const { indexName, mappingFile, aliasName = indexName } = options;
  
  logger.info(`Starting zero-downtime reindex for: ${indexName}`);
  
  try {
    // Step 1: Determine version number
    const timestamp = Date.now();
    const newIndexName = `${indexName}_${timestamp}`;
    
    logger.info(`New index name: ${newIndexName}`);
    
    // Step 2: Load and create new index with full mapping
    const mapping = loadMapping(mappingFile);
    
    await client.indices.create({
      index: newIndexName,
      body: mapping
    });
    
    logger.info(`✅ Created new index with full mapping`);
    
    // Step 3: Check if old index exists
    const oldIndexExists = await client.indices.exists({ index: indexName });
    
    if (oldIndexExists) {
      logger.info(`Reindexing data from ${indexName} to ${newIndexName}...`);
      
      // Reindex data
      const reindexResponse = await client.reindex({
        body: {
          source: {
            index: indexName
          },
          dest: {
            index: newIndexName
          }
        },
        wait_for_completion: true,
        refresh: true
      });
      
      logger.info(`✅ Reindexed ${reindexResponse.total} documents`);
      
      if (reindexResponse.failures && reindexResponse.failures.length > 0) {
        logger.error('Reindex had failures:', reindexResponse.failures);
      }
      
      // Step 4: Check if alias exists and get current index
      const aliasExists = await client.indices.existsAlias({ name: aliasName });
      
      if (aliasExists) {
        // Get indices currently pointed to by alias
        const aliasInfo = await client.indices.getAlias({ name: aliasName });
        const oldIndices = Object.keys(aliasInfo);
        
        logger.info(`Updating alias ${aliasName} from ${oldIndices.join(', ')} to ${newIndexName}`);
        
        // Atomic alias update
        const actions = [
          ...oldIndices.map(oldIndex => ({ remove: { index: oldIndex, alias: aliasName } })),
          { add: { index: newIndexName, alias: aliasName } }
        ];
        
        await client.indices.updateAliases({
          body: { actions }
        });
        
        logger.info(`✅ Alias updated atomically`);
        
        // Step 5: Delete old indices
        for (const oldIndex of oldIndices) {
          if (oldIndex !== newIndexName) {
            await client.indices.delete({ index: oldIndex });
            logger.info(`✅ Deleted old index: ${oldIndex}`);
          }
        }
      } else {
        // Create new alias
        await client.indices.putAlias({
          index: newIndexName,
          name: aliasName
        });
        
        logger.info(`✅ Created new alias: ${aliasName} -> ${newIndexName}`);
        
        // Delete the old index without alias
        if (indexName !== aliasName) {
          await client.indices.delete({ index: indexName });
          logger.info(`✅ Deleted old index: ${indexName}`);
        }
      }
    } else {
      logger.info(`No existing index found, creating new alias`);
      
      // Create new alias
      await client.indices.putAlias({
        index: newIndexName,
        name: aliasName
      });
      
      logger.info(`✅ Created new alias: ${aliasName} -> ${newIndexName}`);
    }
    
    logger.info(`✅ Zero-downtime reindex complete for ${indexName}`);
    logger.info(`   Alias: ${aliasName} -> ${newIndexName}`);
    
  } catch (error) {
    logger.error(`Failed to reindex ${indexName}:`, error);
    throw error;
  }
}

async function reindexAll() {
  try {
    logger.info('🔄 Starting zero-downtime reindex for all indices');
    logger.info('');
    
    // Reindex venues
    await reindexWithAlias({
      indexName: 'venues',
      mappingFile: 'venues_mapping.json'
    });
    logger.info('');
    
    // Reindex events
    await reindexWithAlias({
      indexName: 'events',
      mappingFile: 'events_mapping.json'
    });
    logger.info('');
    
    // Reindex tickets
    await reindexWithAlias({
      indexName: 'tickets',
      mappingFile: 'tickets_mapping.json'
    });
    logger.info('');
    
    // Reindex marketplace
    await reindexWithAlias({
      indexName: 'marketplace',
      mappingFile: 'marketplace_mapping.json'
    });
    logger.info('');
    
    logger.info('✅ All indices reindexed successfully with zero downtime');
    logger.info('');
    logger.info('📊 Summary:');
    logger.info('  - All indices now use full mappings from JSON files');
    logger.info('  - Aliases created for seamless index management');
    logger.info('  - Old indices deleted');
    logger.info('  - No downtime during migration');
    logger.info('');
    logger.info('💡 Usage:');
    logger.info('  - Applications should use alias names (venues, events, tickets, marketplace)');
    logger.info('  - Actual indices have timestamps (e.g., venues_1702749600000)');
    logger.info('  - Future reindexes can use this script for zero-downtime updates');
    
    process.exit(0);
  } catch (error) {
    logger.error('Reindex failed:', error);
    process.exit(1);
  }
}

// Allow running for single index or all
const indexArg = process.argv[2];

if (indexArg) {
  const mappingFiles: Record<string, string> = {
    venues: 'venues_mapping.json',
    events: 'events_mapping.json',
    tickets: 'tickets_mapping.json',
    marketplace: 'marketplace_mapping.json'
  };
  
  if (mappingFiles[indexArg]) {
    reindexWithAlias({
      indexName: indexArg,
      mappingFile: mappingFiles[indexArg]
    }).then(() => process.exit(0)).catch(err => {
      logger.error('Reindex failed:', err);
      process.exit(1);
    });
  } else {
    logger.error(`Unknown index: ${indexArg}`);
    logger.info('Available indices: venues, events, tickets, marketplace');
    logger.info('Usage: npm run reindex [index-name]');
    logger.info('   or: npm run reindex (reindex all)');
    process.exit(1);
  }
} else {
  reindexAll();
}
