import { Pool } from 'pg';
import { TicketService } from '../services/ticketService';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { QueueService } from '../services/queueService';
import { QRService } from '../services/qrService';
import { SolanaService } from '../services/solanaService';
import { TaxService } from '../services/taxService';
import { TransferService } from '../services/transferService';

// Initialize database connection
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://tickettoken:4cVXNcP3zWIEmy8Ey1DfvWHYI@postgres:5432/tickettoken_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Services are already instantiated singletons, just use them directly
const databaseService = DatabaseService;
const redisService = RedisService;
const queueService = QueueService;
const qrService = new QRService();
const solanaService = SolanaService;
const taxService = new TaxService();
const transferService = new TransferService();

// Main ticket service with dependencies
const ticketService = new TicketService();

// Export container
// Type definition for container
type ContainerType = {
  db: any;
  services: {
    ticketService: any;
    databaseService: any;
    redisService: any;
    queueService: any;
    qrService: any;
    solanaService: any;
    taxService: any;
    transferService: any;
  };
};

export const container: ContainerType = {
  db: dbPool,
  services: {
    ticketService,
    databaseService,
    redisService,
    queueService,
    qrService,
    solanaService,
    taxService,
    transferService,
  },
};

// Boot-time validation
export function validateContainer(): void {
  const required = [
    'ticketService',
    'databaseService',
    'redisService',
    'queueService',
  ];
  
  for (const service of required) {
    if (!(container.services as any)[service]) {
      throw new Error(`Required service ${service} not initialized`);
    }
  }
  
  console.log('✅ Ticket service container initialized successfully');
}
