export const mockPool = {
  query: jest.fn(),
  on: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
};

export const mockDb = jest.fn(() => ({
  where: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  whereNotNull: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  returning: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis()
}));
