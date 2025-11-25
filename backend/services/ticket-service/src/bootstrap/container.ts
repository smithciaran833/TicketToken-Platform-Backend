import { ticketService } from '../services/ticketService';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { QueueService } from '../services/queueService';
import { qrService } from '../services/qrService';
import { SolanaService } from '../services/solanaService';
import { TaxService } from '../services/taxService';
import { TransferService } from '../services/transferService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'Container' });

// Services are already instantiated singletons, just use them directly
const databaseService = DatabaseService;
const redisService = RedisService;
const queueService = QueueService;
const solanaService = SolanaService;
const taxService = new TaxService();
const transferService = new TransferService();

// Type definition for container
type ContainerType = {
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
    'qrService',
  ];

  for (const service of required) {
    if (!(container.services as any)[service]) {
      throw new Error(`Required service ${service} not initialized`);
    }
  }

  log.info('Ticket service container initialized successfully');
}
