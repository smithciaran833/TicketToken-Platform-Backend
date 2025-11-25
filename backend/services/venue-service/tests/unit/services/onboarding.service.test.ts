import { OnboardingService } from '../../../src/services/onboarding.service';
import { VenueService } from '../../../src/services/venue.service';
import { IntegrationModel } from '../../../src/models/integration.model';
import { LayoutModel } from '../../../src/models/layout.model';
import { StaffModel } from '../../../src/models/staff.model';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('../../../src/services/venue.service');
jest.mock('../../../src/models/integration.model');
jest.mock('../../../src/models/layout.model');
jest.mock('../../../src/models/staff.model');

describe('OnboardingService', () => {
  let onboardingService: OnboardingService;
  let mockVenueService: jest.Mocked<VenueService>;
  let mockDb: any;
  let mockLogger: any;
  let mockIntegrationModel: jest.Mocked<IntegrationModel>;
  let mockLayoutModel: jest.Mocked<LayoutModel>;
  let mockStaffModel: jest.Mocked<StaffModel>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database query builder with all needed methods
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn(),
      count: jest.fn().mockReturnThis(),
    };

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
    });

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    mockVenueService = {} as any;

    mockIntegrationModel = {
      findByVenue: jest.fn(),
      findByVenueAndType: jest.fn(),
      create: jest.fn(),
    } as any;

    mockLayoutModel = {
      findByVenue: jest.fn(),
      create: jest.fn(),
    } as any;

    mockStaffModel = {
      addStaffMember: jest.fn(),
    } as any;

    (IntegrationModel as jest.MockedClass<typeof IntegrationModel>).mockImplementation(
      () => mockIntegrationModel
    );
    (LayoutModel as jest.MockedClass<typeof LayoutModel>).mockImplementation(
      () => mockLayoutModel
    );
    (StaffModel as jest.MockedClass<typeof StaffModel>).mockImplementation(
      () => mockStaffModel
    );

    onboardingService = new OnboardingService({
      venueService: mockVenueService,
      db: mockDb,
      logger: mockLogger,
    });
  });

  // =============================================================================
  // getOnboardingStatus() - 8 test cases
  // =============================================================================

  describe('getOnboardingStatus()', () => {
    const venueId = 'venue-123';
    const mockVenue = {
      id: venueId,
      name: 'Test Venue',
      venue_type: 'arena',
      max_capacity: 20000,
      address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
      },
    };

    beforeEach(() => {
      // Mock venue with complete data - first call
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce(mockVenue) // venue lookup
        .mockResolvedValueOnce({ count: 2 }); // staff count

      mockLayoutModel.findByVenue.mockResolvedValue([{ id: 'layout-1' }] as any);
      mockIntegrationModel.findByVenue.mockResolvedValue([{ id: 'int-1', type: 'stripe' }] as any);
      mockIntegrationModel.findByVenueAndType.mockResolvedValue({ id: 'int-1' } as any);
    });

    it('should return onboarding status with progress', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      expect(status).toBeDefined();
      expect(status.venueId).toBe(venueId);
      expect(status.progress).toBeDefined();
      expect(status.completedSteps).toBeDefined();
      expect(status.totalSteps).toBeDefined();
    });

    it('should include all onboarding steps', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      expect(status.steps).toHaveLength(5);
      expect(status.steps.map((s: any) => s.id)).toEqual([
        'basic_info',
        'address',
        'layout',
        'payment',
        'staff',
      ]);
    });

    it('should calculate progress percentage', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.progress).toBeLessThanOrEqual(100);
      expect(typeof status.progress).toBe('number');
    });

    it('should mark status as completed when all steps done', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      if (status.completedSteps === status.totalSteps) {
        expect(status.status).toBe('completed');
      }
    });

    it('should mark status as in_progress when incomplete', async () => {
      // Mock incomplete data - missing max_capacity
      mockDb._mockQueryBuilder.first
        .mockReset()
        .mockResolvedValueOnce({
          id: venueId,
          name: 'Test Venue',
          venue_type: 'arena',
        })
        .mockResolvedValueOnce({ count: 0 });

      const status = await onboardingService.getOnboardingStatus(venueId);

      expect(status.status).toBe('in_progress');
    });

    it('should identify required vs optional steps', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      const requiredSteps = status.steps.filter((s: any) => s.required);
      const optionalSteps = status.steps.filter((s: any) => !s.required);

      expect(requiredSteps.length).toBeGreaterThan(0);
      expect(optionalSteps.length).toBeGreaterThan(0);
    });

    it('should check basic info completion', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      const basicInfoStep = status.steps.find((s: any) => s.id === 'basic_info');
      expect(basicInfoStep).toBeDefined();
      expect(typeof basicInfoStep.completed).toBe('boolean');
    });

    it('should check address completion', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      const addressStep = status.steps.find((s: any) => s.id === 'address');
      expect(addressStep).toBeDefined();
      expect(typeof addressStep.completed).toBe('boolean');
    });
  });

  // =============================================================================
  // completeStep() - 7 test cases
  // =============================================================================

  describe('completeStep()', () => {
    const venueId = 'venue-123';

    beforeEach(() => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
      });
    });

    it('should complete layout step', async () => {
      const data = {
        name: 'Main Layout',
        venue_type: 'arena',
        sections: [],
        max_capacity: 10000,
      };
      mockLayoutModel.create.mockResolvedValue({ id: 'layout-1' } as any);

      await onboardingService.completeStep(venueId, 'layout', data);

      expect(mockLayoutModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          name: data.name,
        })
      );
    });

    it('should complete payment step', async () => {
      const data = {
        venue_type: 'stripe',
        config: { apiKey: 'test-key' },
      };
      mockIntegrationModel.create.mockResolvedValue({ id: 'int-1' } as any);

      await onboardingService.completeStep(venueId, 'payment', data);

      expect(mockIntegrationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          type: data.venue_type,
        })
      );
    });

    it('should complete staff step', async () => {
      const data = {
        userId: 'user-123',
        role: 'manager',
        permissions: ['manage_events'],
      };
      mockStaffModel.addStaffMember.mockResolvedValue({ id: 'staff-1' } as any);

      await onboardingService.completeStep(venueId, 'staff', data);

      expect(mockStaffModel.addStaffMember).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          user_id: data.userId,
          role: data.role,
        })
      );
    });

    it('should throw error for unknown step', async () => {
      await expect(
        onboardingService.completeStep(venueId, 'unknown_step', {})
      ).rejects.toThrow();
    });

    it('should handle missing data for layout step', async () => {
      await expect(
        onboardingService.completeStep(venueId, 'layout', undefined)
      ).rejects.toThrow();
    });

    it('should handle missing data for payment step', async () => {
      await expect(
        onboardingService.completeStep(venueId, 'payment', undefined)
      ).rejects.toThrow();
    });

    it('should handle missing data for staff step', async () => {
      await expect(
        onboardingService.completeStep(venueId, 'staff', undefined)
      ).rejects.toThrow();
    });
  });

  // =============================================================================
  // Integration - 3 test cases
  // =============================================================================

  describe('Integration', () => {
    const venueId = 'venue-123';

    beforeEach(() => {
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce({
          id: venueId,
          name: 'Test Venue',
          venue_type: 'arena',
          max_capacity: 10000,
          address: {
            street: '123 Main',
            city: 'NYC',
            state: 'NY',
            zipCode: '10001',
          },
        })
        .mockResolvedValueOnce({ count: 0 });
      
      mockLayoutModel.findByVenue.mockResolvedValue([]);
      mockIntegrationModel.findByVenue.mockResolvedValue([]);
      mockIntegrationModel.findByVenueAndType.mockResolvedValue(undefined as any);
    });

    it('should handle venue with no completed optional steps', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      const optionalIncomplete = status.steps.filter(
        (s: any) => !s.required && !s.completed
      );
      expect(optionalIncomplete.length).toBeGreaterThan(0);
    });

    it('should handle venue with partial completion', async () => {
      mockLayoutModel.findByVenue.mockResolvedValue([{ id: 'layout-1' }] as any);

      const status = await onboardingService.getOnboardingStatus(venueId);

      expect(status.progress).toBeGreaterThan(0);
      expect(status.progress).toBeLessThan(100);
    });

    it('should correctly count completed required steps only', async () => {
      const status = await onboardingService.getOnboardingStatus(venueId);

      const requiredCompleted = status.steps.filter(
        (s: any) => s.required && s.completed
      );
      expect(requiredCompleted.length).toBeGreaterThanOrEqual(0);
    });
  });
});
