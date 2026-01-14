/**
 * Unit tests for src/services/onboarding.service.ts
 * Tests venue onboarding: progress tracking, step completion
 */

// Mock chain with all needed methods
const mockChain: any = {
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue([1]),
  update: jest.fn().mockResolvedValue(1),
};

// Make count return a value when awaited
mockChain.count.mockImplementation(() => {
  const countChain = { ...mockChain, then: (resolve: any) => resolve([{ count: '0' }]) };
  return countChain;
});

const mockDb = jest.fn(() => mockChain);

// Mock dependencies before importing
jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the models that OnboardingService uses
jest.mock('../../../src/models/integration.model', () => ({
  IntegrationModel: jest.fn().mockImplementation(() => ({
    findByVenue: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('../../../src/models/layout.model', () => ({
  LayoutModel: jest.fn().mockImplementation(() => ({
    findByVenue: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('../../../src/models/staff.model', () => ({
  StaffModel: jest.fn().mockImplementation(() => ({
    addStaffMember: jest.fn().mockResolvedValue({ id: 'staff-1' }),
  })),
}));

import { OnboardingService } from '../../../src/services/onboarding.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  const mockVenueService = {
    getVenueById: jest.fn(),
  };
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockChain.first.mockResolvedValue(null);
    
    service = new OnboardingService({
      venueService: mockVenueService as any,
      db: mockDb as any,
      logger: mockLogger,
    });
  });

  describe('getOnboardingStatus()', () => {
    const venueId = 'venue-123';

    it('should return onboarding status structure', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
        venue_type: 'theater',
        max_capacity: 500,
        address_line1: '123 Main St',
        city: 'NYC',
        state_province: 'NY',
        postal_code: '10001',
      });

      const result = await service.getOnboardingStatus(venueId);

      expect(result).toHaveProperty('venueId', venueId);
      expect(result).toHaveProperty('progress');
      expect(result).toHaveProperty('completedSteps');
      expect(result).toHaveProperty('totalSteps');
      expect(result).toHaveProperty('steps');
      expect(result).toHaveProperty('status');
    });

    it('should calculate progress percentage', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
        venue_type: 'theater',
        max_capacity: 500,
      });

      const result = await service.getOnboardingStatus(venueId);

      expect(typeof result.progress).toBe('number');
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);
    });

    it('should return in_progress status when steps incomplete', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
      });

      const result = await service.getOnboardingStatus(venueId);

      expect(result.status).toBe('in_progress');
    });

    it('should return steps array with step details', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
        venue_type: 'theater',
        max_capacity: 500,
      });

      const result = await service.getOnboardingStatus(venueId);

      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      const step = result.steps[0];
      expect(step).toHaveProperty('id');
      expect(step).toHaveProperty('name');
      expect(step).toHaveProperty('completed');
      expect(step).toHaveProperty('required');
    });

    it('should include basic_info step', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
      });

      const result = await service.getOnboardingStatus(venueId);

      const basicInfoStep = result.steps.find((s: any) => s.id === 'basic_info');
      expect(basicInfoStep).toBeDefined();
      expect(basicInfoStep.required).toBe(true);
    });

    it('should include address step', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
      });

      const result = await service.getOnboardingStatus(venueId);

      const addressStep = result.steps.find((s: any) => s.id === 'address');
      expect(addressStep).toBeDefined();
      expect(addressStep.required).toBe(true);
    });

    it('should include payment step', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
      });

      const result = await service.getOnboardingStatus(venueId);

      const paymentStep = result.steps.find((s: any) => s.id === 'payment');
      expect(paymentStep).toBeDefined();
      expect(paymentStep.required).toBe(true);
    });

    it('should mark basic_info as complete when all fields present', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        name: 'Test Venue',
        venue_type: 'theater',
        max_capacity: 500,
      });

      const result = await service.getOnboardingStatus(venueId);
      const basicInfoStep = result.steps.find((s: any) => s.id === 'basic_info');

      expect(basicInfoStep.completed).toBe(true);
    });

    it('should mark basic_info as incomplete when name missing', async () => {
      mockChain.first.mockResolvedValue({
        id: venueId,
        venue_type: 'theater',
        max_capacity: 500,
      });

      const result = await service.getOnboardingStatus(venueId);
      const basicInfoStep = result.steps.find((s: any) => s.id === 'basic_info');

      expect(basicInfoStep.completed).toBe(false);
    });
  });

  describe('completeStep()', () => {
    const venueId = 'venue-123';

    it('should update basic_info step', async () => {
      await service.completeStep(venueId, 'basic_info', {
        name: 'New Venue',
        venue_type: 'club',
        max_capacity: 200,
      });

      expect(mockDb).toHaveBeenCalledWith('venues');
      expect(mockChain.update).toHaveBeenCalled();
    });

    it('should update address step', async () => {
      await service.completeStep(venueId, 'address', {
        street: '456 Oak St',
        city: 'LA',
        state: 'CA',
        zipCode: '90001',
      });

      expect(mockDb).toHaveBeenCalledWith('venues');
      expect(mockChain.update).toHaveBeenCalled();
    });

    it('should throw for unknown step', async () => {
      await expect(service.completeStep(venueId, 'unknown_step', {}))
        .rejects.toThrow('Unknown onboarding step');
    });
  });
});
