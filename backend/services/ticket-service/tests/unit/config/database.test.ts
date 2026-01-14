/**
 * Unit Tests for src/config/database.ts
 */

describe('config/database', () => {
  let mockPoolOn: jest.Mock;
  let mockPoolEnd: jest.Mock;
  let mockPoolQuery: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    
    mockPoolOn = jest.fn();
    mockPoolEnd = jest.fn().mockResolvedValue(undefined);
    mockPoolQuery = jest.fn();

    // Mock pg Pool
    jest.doMock('pg', () => ({
      Pool: jest.fn().mockImplementation(() => ({
        on: mockPoolOn,
        end: mockPoolEnd,
        query: mockPoolQuery,
      })),
    }));

    // Mock config
    jest.doMock('../../../src/config/index', () => ({
      config: {
        database: {
          url: 'postgresql://test:test@localhost:5432/testdb',
          pool: {
            min: 2,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
          },
        },
      },
    }));
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('pool', () => {
    it('creates a Pool instance', () => {
      const { Pool } = require('pg');
      require('../../../src/config/database');

      expect(Pool).toHaveBeenCalled();
    });

    it('configures pool with connection string', () => {
      const { Pool } = require('pg');
      require('../../../src/config/database');

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://test:test@localhost:5432/testdb',
        })
      );
    });

    it('registers error handler on pool', () => {
      require('../../../src/config/database');

      expect(mockPoolOn).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('shutdown handlers', () => {
    let registeredHandlers: Map<string, Function>;
    let originalProcessOn: typeof process.on;

    beforeEach(() => {
      registeredHandlers = new Map();
      originalProcessOn = process.on.bind(process);
      
      jest.spyOn(process, 'on').mockImplementation((event: string, handler: any) => {
        registeredHandlers.set(event, handler);
        return process;
      });
    });

    afterEach(() => {
      (process.on as jest.Mock).mockRestore();
    });

    it('registers SIGTERM handler', () => {
      require('../../../src/config/database');

      expect(registeredHandlers.has('SIGTERM')).toBe(true);
    });

    it('registers SIGINT handler', () => {
      require('../../../src/config/database');

      expect(registeredHandlers.has('SIGINT')).toBe(true);
    });

    it('SIGTERM handler calls pool.end()', async () => {
      require('../../../src/config/database');

      const handler = registeredHandlers.get('SIGTERM');
      expect(handler).toBeDefined();

      await handler!();

      expect(mockPoolEnd).toHaveBeenCalled();
    });

    it('SIGINT handler calls pool.end()', async () => {
      require('../../../src/config/database');

      const handler = registeredHandlers.get('SIGINT');
      expect(handler).toBeDefined();

      await handler!();

      expect(mockPoolEnd).toHaveBeenCalled();
    });
  });
});
