// Mock dependencies
jest.mock('knex', () => jest.fn(() => ({
  transaction: jest.fn(),
})));

jest.mock('../../../src/clients/OrderServiceClient', () => ({
  orderServiceClient: {},
  OrderServiceError: class extends Error {},
}));

jest.mock('@tickettoken/shared', () => ({
  percentOfCents: jest.fn(),
  addCents: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

describe('Sagas Index', () => {
  it('should export PurchaseSaga', async () => {
    const { PurchaseSaga } = await import('../../../src/sagas');
    expect(PurchaseSaga).toBeDefined();
  });
});
