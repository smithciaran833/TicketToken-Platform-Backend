export const ticketServiceClient = {
  getTicket: jest.fn(),
  updateTicket: jest.fn(),
  validateTicket: jest.fn(),
  getTicketForTransfer: jest.fn(),
  transferTicket: jest.fn(),
  updateNft: jest.fn(),
  getTicketFull: jest.fn(),
  getTicketEventDate: jest.fn()
};

export const authServiceClient = {
  getUser: jest.fn(),
  getUserByEmail: jest.fn(),
  validateUser: jest.fn(),
  getOrCreateUser: jest.fn(),
  batchIdentityCheck: jest.fn()
};
