/**
 * StaffModel Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';
import { StaffModel, IStaffMember } from '../../src/models/staff.model';
import { v4 as uuidv4 } from 'uuid';

describe('StaffModel', () => {
  let context: TestContext;
  let staffModel: StaffModel;
  let testUserCounter = 0;

  beforeAll(async () => {
    context = await setupTestApp();
    staffModel = new StaffModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean staff for test venue
    await pool.query('DELETE FROM venue_staff WHERE venue_id = $1', [TEST_VENUE_ID]);
    // Ensure owner staff exists
    await pool.query(`
      INSERT INTO venue_staff (id, venue_id, user_id, role, permissions, is_active)
      VALUES ($1, $2, $3, 'owner', ARRAY['*'], true)
      ON CONFLICT (venue_id, user_id) DO UPDATE SET is_active = true, role = 'owner'
    `, [uuidv4(), TEST_VENUE_ID, TEST_USER_ID]);
    testUserCounter++;
  });

  // Helper to create a test user with unique email
  async function createTestUser(): Promise<string> {
    const userId = uuidv4();
    const uniqueEmail = `test-${userId}@test.com`;
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, TEST_TENANT_ID, uniqueEmail, 'hash', 'Test', 'User']
    );
    return userId;
  }

  // Helper to add staff directly via SQL
  async function addStaffDirect(venueId: string, userId: string, role: string, isActive = true): Promise<string> {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO venue_staff (id, venue_id, user_id, role, permissions, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, venueId, userId, role, ['test:permission'], isActive]
    );
    return id;
  }

  // ==========================================================================
  // findByVenueAndUser
  // ==========================================================================
  describe('findByVenueAndUser', () => {
    it('should find staff member by venue and user', async () => {
      const staff = await staffModel.findByVenueAndUser(TEST_VENUE_ID, TEST_USER_ID);

      expect(staff).toBeDefined();
      expect(staff!.venue_id).toBe(TEST_VENUE_ID);
      expect(staff!.user_id).toBe(TEST_USER_ID);
      expect(staff!.role).toBe('owner');
    });

    it('should return null for non-existent combination', async () => {
      const staff = await staffModel.findByVenueAndUser(TEST_VENUE_ID, uuidv4());
      expect(staff).toBeFalsy();
    });

    it('should return null for wrong venue', async () => {
      const staff = await staffModel.findByVenueAndUser(uuidv4(), TEST_USER_ID);
      expect(staff).toBeFalsy();
    });
  });

  // ==========================================================================
  // getVenueStaff
  // ==========================================================================
  describe('getVenueStaff', () => {
    it('should return all active staff for venue', async () => {
      const staff = await staffModel.getVenueStaff(TEST_VENUE_ID);

      expect(staff.length).toBeGreaterThan(0);
      staff.forEach(s => {
        expect(s.venue_id).toBe(TEST_VENUE_ID);
        expect(s.is_active).toBe(true);
      });
    });

    it('should not return inactive staff by default', async () => {
      const userId = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId, 'viewer', false);

      const staff = await staffModel.getVenueStaff(TEST_VENUE_ID);

      expect(staff.find(s => s.user_id === userId)).toBeUndefined();
    });

    it('should include inactive staff when requested', async () => {
      const userId = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId, 'viewer', false);

      const staff = await staffModel.getVenueStaff(TEST_VENUE_ID, true);

      expect(staff.find(s => s.user_id === userId)).toBeDefined();
    });

    it('should order by created_at ascending', async () => {
      const userId1 = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId1, 'manager');

      await new Promise(resolve => setTimeout(resolve, 10));

      const userId2 = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId2, 'viewer');

      const staff = await staffModel.getVenueStaff(TEST_VENUE_ID);

      for (let i = 1; i < staff.length; i++) {
        expect(new Date(staff[i].created_at!).getTime()).toBeGreaterThanOrEqual(
          new Date(staff[i - 1].created_at!).getTime()
        );
      }
    });
  });

  // ==========================================================================
  // getStaffByRole
  // ==========================================================================
  describe('getStaffByRole', () => {
    it('should return staff with specific role', async () => {
      const userId = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId, 'manager');

      const managers = await staffModel.getStaffByRole(TEST_VENUE_ID, 'manager');

      expect(managers.length).toBe(1);
      expect(managers[0].role).toBe('manager');
    });

    it('should return empty array when no staff with role', async () => {
      const viewers = await staffModel.getStaffByRole(TEST_VENUE_ID, 'viewer');
      expect(viewers).toEqual([]);
    });

    it('should only return active staff', async () => {
      const userId = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId, 'box_office', false);

      const boxOffice = await staffModel.getStaffByRole(TEST_VENUE_ID, 'box_office');
      expect(boxOffice).toEqual([]);
    });
  });

  // ==========================================================================
  // addStaffMember
  // ==========================================================================
  describe('addStaffMember', () => {
    it('should add new staff member', async () => {
      const userId = await createTestUser();

      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'manager'
      });

      expect(staff.id).toBeDefined();
      expect(staff.venue_id).toBe(TEST_VENUE_ID);
      expect(staff.user_id).toBe(userId);
      expect(staff.role).toBe('manager');
      expect(staff.is_active).toBe(true);
    });

    it('should assign default permissions for role', async () => {
      const userId = await createTestUser();

      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'door_staff'
      });

      expect(staff.permissions).toBeDefined();
      expect(staff.permissions).toContain('tickets:validate');
      expect(staff.permissions).toContain('tickets:view');
    });

    it('should use custom permissions if provided', async () => {
      const userId = await createTestUser();
      const customPerms = ['custom:permission', 'another:perm'];

      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'viewer',
        permissions: customPerms
      });

      expect(staff.permissions).toEqual(customPerms);
    });

    it('should throw error for duplicate active staff', async () => {
      await expect(
        staffModel.addStaffMember({
          venue_id: TEST_VENUE_ID,
          user_id: TEST_USER_ID,
          role: 'manager'
        })
      ).rejects.toThrow('Staff member already exists');
    });

    it('should reactivate inactive staff member', async () => {
      const userId = await createTestUser();
      const originalId = await addStaffDirect(TEST_VENUE_ID, userId, 'box_office', false);

      const reactivated = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'manager'
      });

      expect(reactivated.id).toBe(originalId);
      expect(reactivated.is_active).toBe(true);
      expect(reactivated.role).toBe('manager');
    });

    it('should assign owner permissions', async () => {
      const userId = await createTestUser();

      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'owner'
      });

      expect(staff.permissions).toContain('*');
    });

    it('should assign manager permissions', async () => {
      const userId = await createTestUser();

      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'manager'
      });

      expect(staff.permissions).toContain('venue:read');
      expect(staff.permissions).toContain('events:create');
      expect(staff.permissions).toContain('staff:view');
    });

    it('should assign box_office permissions', async () => {
      const userId = await createTestUser();

      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'box_office'
      });

      expect(staff.permissions).toContain('tickets:sell');
      expect(staff.permissions).toContain('payments:process');
    });
  });

  // ==========================================================================
  // updateRole
  // ==========================================================================
  describe('updateRole', () => {
    it('should update staff role', async () => {
      const userId = await createTestUser();
      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'viewer'
      });

      const updated = await staffModel.updateRole(staff.id!, 'manager');

      expect(updated.role).toBe('manager');
    });

    it('should update permissions to new role defaults', async () => {
      const userId = await createTestUser();
      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'viewer'
      });

      const updated = await staffModel.updateRole(staff.id!, 'manager');

      expect(updated.permissions).toContain('venue:read');
      expect(updated.permissions).toContain('events:create');
    });
  });

  // ==========================================================================
  // deactivateStaffMember
  // ==========================================================================
  describe('deactivateStaffMember', () => {
    it('should deactivate staff member', async () => {
      const userId = await createTestUser();
      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'viewer'
      });

      const result = await staffModel.deactivateStaffMember(staff.id!);

      expect(result).toBe(true);

      const found = await staffModel.findByVenueAndUser(TEST_VENUE_ID, userId);
      expect(found!.is_active).toBe(false);
    });
  });

  // ==========================================================================
  // reactivateStaffMember
  // ==========================================================================
  describe('reactivateStaffMember', () => {
    it('should reactivate staff member', async () => {
      const userId = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId, 'viewer', false);

      const staff = await staffModel.findByVenueAndUser(TEST_VENUE_ID, userId);
      const result = await staffModel.reactivateStaffMember(staff!.id!);

      expect(result).toBe(true);

      const found = await staffModel.findByVenueAndUser(TEST_VENUE_ID, userId);
      expect(found!.is_active).toBe(true);
    });
  });

  // ==========================================================================
  // getUserVenues
  // ==========================================================================
  describe('getUserVenues', () => {
    it('should return venues for user', async () => {
      const venues = await staffModel.getUserVenues(TEST_USER_ID);

      expect(venues.length).toBeGreaterThan(0);
      expect(venues[0].venue_id).toBe(TEST_VENUE_ID);
      expect(venues[0].role).toBe('owner');
    });

    it('should only return active staff assignments', async () => {
      const userId = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId, 'manager', false);

      const venues = await staffModel.getUserVenues(userId);
      expect(venues).toEqual([]);
    });

    it('should return empty array for user with no venues', async () => {
      const userId = await createTestUser();
      const venues = await staffModel.getUserVenues(userId);
      expect(venues).toEqual([]);
    });
  });

  // ==========================================================================
  // hasPermission
  // ==========================================================================
  describe('hasPermission', () => {
    it('should return true for owner regardless of permission', async () => {
      const hasPermission = await staffModel.hasPermission(
        TEST_VENUE_ID,
        TEST_USER_ID,
        'any:permission:at:all'
      );
      expect(hasPermission).toBe(true);
    });

    it('should check specific permission for non-owner', async () => {
      const userId = await createTestUser();
      await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'door_staff'
      });

      const canValidate = await staffModel.hasPermission(TEST_VENUE_ID, userId, 'tickets:validate');
      const canCreateEvents = await staffModel.hasPermission(TEST_VENUE_ID, userId, 'events:create');

      expect(canValidate).toBe(true);
      expect(canCreateEvents).toBe(false);
    });

    it('should return false for non-existent staff', async () => {
      const hasPermission = await staffModel.hasPermission(
        TEST_VENUE_ID,
        uuidv4(),
        'tickets:validate'
      );
      expect(hasPermission).toBe(false);
    });

    it('should return false for inactive staff', async () => {
      const userId = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId, 'manager', false);

      const hasPermission = await staffModel.hasPermission(
        TEST_VENUE_ID,
        userId,
        'events:create'
      );
      expect(hasPermission).toBe(false);
    });
  });

  // ==========================================================================
  // validateStaffLimit
  // ==========================================================================
  describe('validateStaffLimit', () => {
    it('should return staff limit info', async () => {
      const result = await staffModel.validateStaffLimit(TEST_VENUE_ID);

      expect(result.limit).toBe(50);
      expect(result.current).toBeGreaterThan(0);
      expect(result.canAdd).toBe(true);
    });

    it('should count only active staff', async () => {
      const userId1 = await createTestUser();
      const userId2 = await createTestUser();
      await addStaffDirect(TEST_VENUE_ID, userId1, 'viewer', true);
      await addStaffDirect(TEST_VENUE_ID, userId2, 'viewer', false);

      const result = await staffModel.validateStaffLimit(TEST_VENUE_ID);

      // owner + userId1 = 2
      expect(result.current).toBe(2);
    });
  });

  // ==========================================================================
  // delete (soft delete via is_active)
  // ==========================================================================
  describe('delete', () => {
    it('should soft delete by setting is_active to false', async () => {
      const userId = await createTestUser();
      const staff = await staffModel.addStaffMember({
        venue_id: TEST_VENUE_ID,
        user_id: userId,
        role: 'viewer'
      });

      await staffModel.delete(staff.id!);

      const found = await staffModel.findByVenueAndUser(TEST_VENUE_ID, userId);
      expect(found!.is_active).toBe(false);
    });
  });

  // ==========================================================================
  // withTransaction
  // ==========================================================================
  describe('withTransaction', () => {
    it('should work within transaction', async () => {
      const userId = await createTestUser();

      await context.db.transaction(async (trx) => {
        const trxModel = staffModel.withTransaction(trx);
        await trxModel.addStaffMember({
          venue_id: TEST_VENUE_ID,
          user_id: userId,
          role: 'viewer'
        });
      });

      const staff = await staffModel.findByVenueAndUser(TEST_VENUE_ID, userId);
      expect(staff).toBeDefined();
    });
  });
});
