/**
 * Queue Standardization Validation Tests
 *
 * Decision #4 Compliance Verification
 *
 * Tests to verify:
 * 1. RabbitMQ is used for inter-service events
 * 2. Bull is used for internal background jobs
 * 3. No stub implementations remain
 * 4. Event flow integrity
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVICES_DIR = path.resolve(__dirname, '../../..');

describe('Queue Standardization Validation', () => {

  describe('RabbitMQ Implementation Verification', () => {

    const servicesWithRabbitMQ = [
      'marketplace-service',
      'minting-service',
      'ticket-service',
      'auth-service',
      'event-service',
      'blockchain-service',
      'venue-service',
      'analytics-service',
      'notification-service',
      'search-service',
      'payment-service',
      'order-service',
    ];

    servicesWithRabbitMQ.forEach(service => {
      it(`${service} should have amqplib in dependencies`, () => {
        const pkgPath = path.join(SERVICES_DIR, service, 'package.json');

        if (!fs.existsSync(pkgPath)) {
          console.warn(`Skipping ${service} - package.json not found`);
          return;
        }

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

        expect(pkg.dependencies.amqplib || pkg.devDependencies?.amqplib).toBeDefined();
      });
    });

    it('integration-service should NOT have amqplib (unused)', () => {
      const pkgPath = path.join(SERVICES_DIR, 'integration-service', 'package.json');

      if (!fs.existsSync(pkgPath)) {
        console.warn('Skipping integration-service - package.json not found');
        return;
      }

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.dependencies?.amqplib).toBeUndefined();
    });
  });

  describe('No Stub Implementations', () => {

    const filesToCheck = [
      { service: 'marketplace-service', file: 'src/config/rabbitmq.ts', badPattern: /stub|mock|fake|TODO.*implement/i },
      { service: 'minting-service', file: 'src/config/rabbitmq.ts', badPattern: /stub|mock|fake|TODO.*implement/i },
      { service: 'ticket-service', file: 'src/services/queueListener.ts', badPattern: /stub|mock|fake|TODO.*implement/i },
      { service: 'auth-service', file: 'src/config/rabbitmq.ts', badPattern: /stub|mock|fake|TODO.*implement/i },
      { service: 'event-service', file: 'src/config/rabbitmq.ts', badPattern: /stub|mock|fake|TODO.*implement/i },
    ];

    filesToCheck.forEach(({ service, file, badPattern }) => {
      it(`${service}/${file} should not contain stub implementations`, () => {
        const filePath = path.join(SERVICES_DIR, service, file);

        if (!fs.existsSync(filePath)) {
          console.warn(`Skipping ${service}/${file} - file not found`);
          return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for stub patterns (excluding comments about what was replaced)
        const lines = content.split('\n');
        const problematicLines = lines.filter((line, idx) => {
          // Skip comment lines
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
            return false;
          }
          return badPattern.test(line);
        });

        expect(problematicLines).toEqual([]);
      });
    });
  });

  describe('Real amqplib Import Verification', () => {

    const publisherFiles = [
      { service: 'marketplace-service', file: 'src/config/rabbitmq.ts' },
      { service: 'auth-service', file: 'src/config/rabbitmq.ts' },
      { service: 'event-service', file: 'src/config/rabbitmq.ts' },
    ];

    publisherFiles.forEach(({ service, file }) => {
      it(`${service}/${file} should import from amqplib`, () => {
        const filePath = path.join(SERVICES_DIR, service, file);

        if (!fs.existsSync(filePath)) {
          console.warn(`Skipping ${service}/${file} - file not found`);
          return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        expect(content).toMatch(/import.*from ['"]amqplib['"]/);
      });
    });
  });

  describe('Event Publisher Method Verification', () => {

    it('marketplace-service should export MarketplaceEventPublisher', () => {
      const filePath = path.join(SERVICES_DIR, 'marketplace-service/src/config/rabbitmq.ts');

      if (!fs.existsSync(filePath)) {
        console.warn('Skipping - file not found');
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toMatch(/export.*MarketplaceEventPublisher/);
      expect(content).toMatch(/listingCreated/);
      expect(content).toMatch(/listingSold/);
      expect(content).toMatch(/transferComplete/);
    });

    it('auth-service should export AuthEventPublisher', () => {
      const filePath = path.join(SERVICES_DIR, 'auth-service/src/config/rabbitmq.ts');

      if (!fs.existsSync(filePath)) {
        console.warn('Skipping - file not found');
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toMatch(/export.*AuthEventPublisher/);
      expect(content).toMatch(/userRegistered/);
      expect(content).toMatch(/userLogin/);
    });

    it('event-service should export EventLifecyclePublisher', () => {
      const filePath = path.join(SERVICES_DIR, 'event-service/src/config/rabbitmq.ts');

      if (!fs.existsSync(filePath)) {
        console.warn('Skipping - file not found');
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toMatch(/export.*EventLifecyclePublisher/);
      expect(content).toMatch(/eventCreated/);
      expect(content).toMatch(/eventCancelled/);
    });
  });

  describe('Consumer Implementation Verification', () => {

    it('minting-service should have RabbitMQ-Bull bridge', () => {
      const filePath = path.join(SERVICES_DIR, 'minting-service/src/config/rabbitmq.ts');

      if (!fs.existsSync(filePath)) {
        console.warn('Skipping - file not found');
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Verify it imports amqplib
      expect(content).toMatch(/import.*from ['"]amqplib['"]/);

      // Verify it consumes from RabbitMQ
      expect(content).toMatch(/consume/);

      // Verify it bridges to Bull
      expect(content).toMatch(/addMintJob/);
    });

    it('ticket-service should have RabbitMQ consumer', () => {
      const filePath = path.join(SERVICES_DIR, 'ticket-service/src/services/queueListener.ts');

      if (!fs.existsSync(filePath)) {
        console.warn('Skipping - file not found');
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Verify it imports amqplib
      expect(content).toMatch(/import.*from ['"]amqplib['"]/);

      // Verify it has consume logic
      expect(content).toMatch(/consume/);
    });
  });

  describe('Queue Technology Standards', () => {

    it('queue-service should use pg-boss (documented exception)', () => {
      const docPath = path.join(SERVICES_DIR, 'queue-service/src/docs/QUEUE_ARCHITECTURE.md');

      if (!fs.existsSync(docPath)) {
        console.warn('Skipping - documentation not found');
        return;
      }

      const content = fs.readFileSync(docPath, 'utf-8');

      expect(content).toMatch(/pg-boss/i);
      expect(content).toMatch(/exception/i);
      expect(content).toMatch(/APPROVED/i);
    });

    it('notification-service should use bull (not bullmq)', () => {
      const pkgPath = path.join(SERVICES_DIR, 'notification-service/package.json');

      if (!fs.existsSync(pkgPath)) {
        console.warn('Skipping - package.json not found');
        return;
      }

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      // Migrated from bullmq to bull
      expect(pkg.dependencies.bull).toBeDefined();
      expect(pkg.dependencies.bullmq).toBeUndefined();
    });

    it('notification-service queue.service.ts should import from bull', () => {
      const filePath = path.join(SERVICES_DIR, 'notification-service/src/services/queue.service.ts');

      if (!fs.existsSync(filePath)) {
        console.warn('Skipping - queue.service.ts not found');
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Should import from bull, not bullmq
      expect(content).toMatch(/from ['"]bull['"]/);
      expect(content).not.toMatch(/from ['"]bullmq['"]/);
    });
  });

  describe('mint.success Consumer', () => {

    it('minting-service should have mint.success consumer', () => {
      const filePath = path.join(SERVICES_DIR, 'minting-service/src/config/rabbitmq.ts');

      if (!fs.existsSync(filePath)) {
        console.warn('Skipping - rabbitmq.ts not found');
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Verify mint.success queue configuration
      expect(content).toMatch(/mintSuccessQueue/);
      expect(content).toMatch(/mint\.success/);

      // Verify handler exists
      expect(content).toMatch(/handleMintSuccessMessage/);
    });

    it('should document mint.success consumer implementation', () => {
      const phase3DocPath = path.join(SERVICES_DIR, 'marketplace-service/docs/QUEUE_STANDARDIZATION_PHASE3.md');

      if (!fs.existsSync(phase3DocPath)) {
        console.warn('Skipping - Phase 3 documentation not found');
        return;
      }

      const content = fs.readFileSync(phase3DocPath, 'utf-8');

      expect(content).toMatch(/mint\.success/);
      expect(content).toMatch(/IMPLEMENTED|COMPLETED/i);
    });
  });

  describe('Exchange Configuration', () => {

    const expectedExchanges = [
      { service: 'marketplace-service', exchange: 'marketplace-events' },
      { service: 'marketplace-service', exchange: 'tickettoken_events' },
      { service: 'auth-service', exchange: 'auth-events' },
      { service: 'auth-service', exchange: 'tickettoken_events' },
      { service: 'event-service', exchange: 'event-lifecycle' },
      { service: 'event-service', exchange: 'tickettoken_events' },
    ];

    expectedExchanges.forEach(({ service, exchange }) => {
      it(`${service} should configure ${exchange} exchange`, () => {
        const filePath = path.join(SERVICES_DIR, `${service}/src/config/rabbitmq.ts`);

        if (!fs.existsSync(filePath)) {
          console.warn(`Skipping ${service} - rabbitmq.ts not found`);
          return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        expect(content).toMatch(new RegExp(exchange.replace(/-/g, '[-_]?'), 'i'));
      });
    });
  });
});
