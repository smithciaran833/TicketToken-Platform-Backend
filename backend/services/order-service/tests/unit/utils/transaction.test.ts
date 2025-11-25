import { Pool, PoolClient } from 'pg';
import { withTransaction } from '../../../src/utils/transaction';

describe('withTransaction', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    } as any;

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should begin transaction, execute callback, commit, and release client', async () => {
    const callback = jest.fn().mockResolvedValue('result');

    const result = await withTransaction(mockPool, callback);

    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(callback).toHaveBeenCalledWith(mockClient);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it('should rollback on callback error and release client', async () => {
    const error = new Error('Callback error');
    const callback = jest.fn().mockRejectedValue(error);

    await expect(withTransaction(mockPool, callback)).rejects.toThrow('Callback error');

    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(callback).toHaveBeenCalledWith(mockClient);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('should release client even if rollback fails', async () => {
    const error = new Error('Callback error');
    const callback = jest.fn().mockRejectedValue(error);

    mockClient.query.mockImplementation((sql) => {
      if (sql === 'ROLLBACK') {
        throw new Error('Rollback error');
      }
      return Promise.resolve({} as any);
    });

    // Should still throw the callback error (or rollback error since rollback failed)
    // Either is acceptable behavior - the key is that client.release() is called
    await expect(withTransaction(mockPool, callback)).rejects.toThrow();

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple operations in transaction', async () => {
    const callback = jest.fn().mockImplementation(async (client) => {
      await client.query('INSERT INTO orders VALUES ($1)', ['order1']);
      await client.query('INSERT INTO order_items VALUES ($1)', ['item1']);
      return 'success';
    });

    const result = await withTransaction(mockPool, callback);

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO orders VALUES ($1)', ['order1']);
    expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO order_items VALUES ($1)', ['item1']);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(result).toBe('success');
  });

  it('should properly type the return value', async () => {
    interface TestResult {
      id: string;
      name: string;
    }

    const callback = jest.fn().mockResolvedValue({ id: '123', name: 'test' });

    const result: TestResult = await withTransaction<TestResult>(mockPool, callback);

    expect(result.id).toBe('123');
    expect(result.name).toBe('test');
  });
});
