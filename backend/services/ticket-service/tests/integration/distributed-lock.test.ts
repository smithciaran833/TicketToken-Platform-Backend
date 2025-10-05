import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { TicketService } from '../../src/services/ticketService';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';
import { v4 as uuidv4 } from 'uuid';

describe('Distributed Locking - Ticket Service', () => {
  let ticketService: TicketService;
  const testTenantId = '00000000-0000-0000-0000-000000000001';
  const testEventId = 'f90ed044-82a9-4b9f-bb99-bcabf8a1be1a';

  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();
    ticketService = new TicketService();
  }, 30000);

  afterAll(async () => {
    await RedisService.close();
    await DatabaseService.close();
  });

  describe('Reservation Race Conditions', () => {
    it('prevents double-booking under concurrent load', async () => {
      // Setup: Create ticket type with 1 available
      const tierId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO ticket_types (id, event_id, name, price, available_quantity, total_quantity, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tierId, testEventId, 'Test Tier', 10000, 1, 1, testTenantId]
      );

      console.log('\n=== BEFORE RESERVATIONS ===');
      const beforeInventory = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [tierId]
      );
      console.log('Inventory before:', beforeInventory.rows[0].available_quantity);

      // Execute: 10 concurrent reservation attempts
      const userIds = Array.from({ length: 10 }, () => uuidv4());
      const reservationPromises = userIds.map((userId, index) =>
        ticketService.createReservation({
          userId,
          eventId: testEventId,
          tickets: [{ ticketTypeId: tierId, quantity: 1 }]
        })
        .then(result => {
          console.log(`Request ${index} SUCCESS:`, result.id);
          return { success: true, result, index };
        })
        .catch(err => {
          console.log(`Request ${index} FAILED:`, err.message);
          return { success: false, error: err, index };
        })
      );

      const results = await Promise.all(reservationPromises);

      console.log('\n=== AFTER RESERVATIONS ===');
      
      // Check inventory IMMEDIATELY after reservations
      const afterInventory = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [tierId]
      );
      console.log('Inventory after:', afterInventory.rows[0].available_quantity);

      // Check how many reservations exist in database
      const dbReservations = await DatabaseService.query(
        'SELECT id, user_id, quantity, status FROM reservations WHERE ticket_type_id = $1',
        [tierId]
      );
      console.log('Reservations in DB:', dbReservations.rows.length);
      dbReservations.rows.forEach(r => {
        console.log(`  - ${r.id}: user=${r.user_id}, qty=${r.quantity}, status=${r.status}`);
      });

      const successes = results.filter(r => r.success);
      const failures = results.filter(r => !r.success);
      
      console.log('\n=== RESULTS ===');
      console.log('Successful calls:', successes.length);
      console.log('Failed calls:', failures.length);
      console.log('Expected: 1 success, 9 failures');

      // Assertions
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);
      expect(afterInventory.rows[0].available_quantity).toBe(0);
      expect(dbReservations.rows.length).toBe(1);

      // Cleanup
      console.log('\n=== CLEANUP ===');
      await DatabaseService.query('DELETE FROM reservations WHERE ticket_type_id = $1', [tierId]);
      await DatabaseService.query('DELETE FROM ticket_types WHERE id = $1', [tierId]);
      console.log('Cleanup complete\n');
    }, 30000);
  });
});
