import { Request, Response, NextFunction } from 'express';
import { SyncController } from '../../src/controllers/sync.controller';
import { db } from '../../src/config/database';

// Setup mock
const mockDb = db as any;

describe('Debug failing tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      params: { provider: 'stripe' },
      body: { venueId: 'test-venue-id' },
      query: { venueId: 'test-venue-id' }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    next = jest.fn((error?: any) => {
      console.log('ERROR CAUGHT:', error);
    }) as NextFunction;
    
    // Setup mock db
    mockDb.mockImplementation(() => mockDb);
    mockDb.where = jest.fn().mockReturnValue(mockDb);
    mockDb.update = jest.fn().mockResolvedValue(1);
    mockDb.offset = jest.fn().mockResolvedValue([]);
    mockDb.first = jest.fn().mockResolvedValue(null);
  });

  it('Debug stopSync', async () => {
    const controller = new SyncController();
    try {
      await controller.stopSync(req as Request, res as Response, next);
      console.log('res.json called:', (res.json as jest.Mock).mock.calls);
      console.log('next called:', (next as jest.Mock).mock.calls);
    } catch (error) {
      console.log('Uncaught error:', error);
    }
  });

  it('Debug getSyncHistory', async () => {
    const controller = new SyncController();
    
    mockDb.orderBy = jest.fn().mockReturnValue(mockDb);
    mockDb.limit = jest.fn().mockReturnValue(mockDb);
    mockDb.offset = jest.fn().mockResolvedValue([
      { id: 'test', status: 'completed' }
    ]);
    
    try {
      await controller.getSyncHistory(req as Request, res as Response, next);
      console.log('res.json called:', (res.json as jest.Mock).mock.calls);
      console.log('next called:', (next as jest.Mock).mock.calls);
    } catch (error) {
      console.log('Uncaught error:', error);
    }
  });
});
