/**
 * Mock for @tickettoken/shared/clients
 */
export const authServiceClient = {
  getAdminUsers: jest.fn().mockResolvedValue([]),
  getUser: jest.fn().mockResolvedValue(null),
  validateToken: jest.fn().mockResolvedValue({ valid: true })
};

export const venueServiceClient = {
  batchGetVenueNames: jest.fn().mockResolvedValue({ venues: {} }),
  getVenue: jest.fn().mockResolvedValue(null),
  getVenuesByTenant: jest.fn().mockResolvedValue([])
};
