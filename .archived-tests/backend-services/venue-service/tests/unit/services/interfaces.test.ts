import {
  IStaff,
  ILayout,
  IVenueService,
  IIntegrationService,
  IOnboardingService,
  IComplianceService,
  IVerificationService,
  ILayoutService,
} from '../../../src/services/interfaces';

describe('Service Interfaces', () => {
  // =============================================================================
  // Interface Type Checks - 8 test cases
  // =============================================================================

  it('should export IStaff interface', () => {
    const staff: IStaff = {
      id: 'staff-1',
      user_id: 'user-1',
      venue_id: 'venue-1',
      role: 'manager',
    };
    expect(staff).toBeDefined();
  });

  it('should export ILayout interface', () => {
    const layout: ILayout = {
      id: 'layout-1',
      venue_id: 'venue-1',
      name: 'Main Floor',
      sections: [],
      total_capacity: 1000,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(layout).toBeDefined();
  });

  it('should export IVenueService interface', () => {
    const mockVenueService: Partial<IVenueService> = {
      createVenue: jest.fn(),
      getVenue: jest.fn(),
    };
    expect(mockVenueService).toBeDefined();
  });

  it('should export IIntegrationService interface', () => {
    const mockIntegrationService: Partial<IIntegrationService> = {
      listIntegrations: jest.fn(),
      getIntegration: jest.fn(),
    };
    expect(mockIntegrationService).toBeDefined();
  });

  it('should export IOnboardingService interface', () => {
    const mockOnboardingService: Partial<IOnboardingService> = {
      getOnboardingStatus: jest.fn(),
      completeStep: jest.fn(),
    };
    expect(mockOnboardingService).toBeDefined();
  });

  it('should export IComplianceService interface', () => {
    const mockComplianceService: Partial<IComplianceService> = {
      getComplianceSettings: jest.fn(),
      generateComplianceReport: jest.fn(),
    };
    expect(mockComplianceService).toBeDefined();
  });

  it('should export IVerificationService interface', () => {
    const mockVerificationService: Partial<IVerificationService> = {
      submitVerification: jest.fn(),
      getVerificationStatus: jest.fn(),
    };
    expect(mockVerificationService).toBeDefined();
  });

  it('should export ILayoutService interface', () => {
    const mockLayoutService: Partial<ILayoutService> = {
      createLayout: jest.fn(),
      getLayouts: jest.fn(),
    };
    expect(mockLayoutService).toBeDefined();
  });
});
