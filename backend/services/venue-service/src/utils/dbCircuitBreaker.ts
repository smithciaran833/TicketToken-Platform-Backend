import { Knex } from 'knex';
import { withCircuitBreaker } from './circuitBreaker';
import { logger } from './logger';

export function wrapDatabaseWithCircuitBreaker(db: Knex): Knex {
  // Create wrapped version of key database methods
  const originalFrom = db.from.bind(db);
  const originalRaw = db.raw.bind(db);
  const originalTransaction = db.transaction.bind(db);

  // Wrap the 'from' method
  const fromWithBreaker = withCircuitBreaker(
    originalFrom,
    { name: 'db-query', timeout: 5000 }
  );

  // Wrap the 'raw' method
  const rawWithBreaker = withCircuitBreaker(
    originalRaw,
    { name: 'db-raw', timeout: 5000 }
  );

  // Wrap the 'transaction' method
  const transactionWithBreaker = withCircuitBreaker(
    originalTransaction,
    { name: 'db-transaction', timeout: 10000 }
  );

  // Override methods
  (db as any).from = fromWithBreaker;
  (db as any).raw = rawWithBreaker;
  (db as any).transaction = transactionWithBreaker;

  return db;
}
export const createDbCircuitBreaker = (db: any) => { return db; };
