import { listingService } from '../services/listing.service';
import { transferService } from '../services/transfer.service';
import { walletService } from '../services/wallet.service';
import { notificationService } from '../services/notification.service';
import { searchService } from '../services/search.service';
import { antiBotService } from '../services/anti-bot.service';
import { disputeService } from '../services/dispute.service';
import { taxReportingService } from '../services/tax-reporting.service';
import { venueRulesService } from '../services/venue-rules.service';
import { validationService } from '../services/validation.service';
import { eventPublisher } from '../events/publishers';
import { eventHandlers } from '../events/handlers';
import { logger } from '../utils/logger';

export interface Dependencies {
  services: {
    listing: typeof listingService;
    transfer: typeof transferService;
    wallet: typeof walletService;
    notification: typeof notificationService;
    search: typeof searchService;
    antiBot: typeof antiBotService;
    dispute: typeof disputeService;
    taxReporting: typeof taxReportingService;
    venueRules: typeof venueRulesService;
    validation: typeof validationService;
  };
  events: {
    publisher: typeof eventPublisher;
    handlers: typeof eventHandlers;
  };
  logger: typeof logger;
}

let dependencies: Dependencies | null = null;

export const initializeDependencies = (): Dependencies => {
  if (dependencies) {
    return dependencies;
  }
  
  dependencies = {
    services: {
      listing: listingService,
      transfer: transferService,
      wallet: walletService,
      notification: notificationService,
      search: searchService,
      antiBot: antiBotService,
      dispute: disputeService,
      taxReporting: taxReportingService,
      venueRules: venueRulesService,
      validation: validationService
    },
    events: {
      publisher: eventPublisher,
      handlers: eventHandlers
    },
    logger
  };
  
  logger.info('Dependencies initialized');
  return dependencies;
};

export const getDependencies = (): Dependencies => {
  if (!dependencies) {
    throw new Error('Dependencies not initialized. Call initializeDependencies() first.');
  }
  return dependencies;
};
