export const mockVenueVerification = {
  id: 'verification-123',
  venueId: 'venue-456',
  status: 'pending',
  type: 'KYB',
  documents: [],
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z'
};

export const mockTaxCalculation = {
  eventId: 'event-789',
  ticketPrice: 100,
  stateTax: 7.5,
  localTax: 2.5,
  totalTax: 10,
  totalPrice: 110
};

export const mockRiskAssessment = {
  entityId: 'venue-456',
  score: 75,
  level: 'medium',
  factors: ['new_account', 'high_volume'],
  assessedAt: '2024-01-15T10:00:00Z'
};

export const mockOFACCheck = {
  name: 'John Doe',
  matches: [],
  cleared: true,
  checkedAt: '2024-01-15T10:00:00Z'
};

export const mockBankAccount = {
  id: 'bank-123',
  accountNumber: '****1234',
  routingNumber: '****5678',
  status: 'verified',
  verifiedAt: '2024-01-15T10:00:00Z'
};

export const mockComplianceDocument = {
  id: 'doc-123',
  type: 'business_license',
  filename: 'license.pdf',
  uploadedBy: 'user-456',
  uploadedAt: '2024-01-15T10:00:00Z'
};

export const mockGDPRRequest = {
  id: 'gdpr-123',
  type: 'data_export',
  userId: 'user-456',
  status: 'pending',
  requestedAt: '2024-01-15T10:00:00Z'
};

export const mockBatchJob = {
  id: 'job-123',
  type: 'kyc_checks',
  status: 'running',
  progress: 45,
  total: 100,
  startedAt: '2024-01-15T10:00:00Z'
};
