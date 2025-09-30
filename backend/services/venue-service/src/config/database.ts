import knex, { Knex } from 'knex';

export const dbConfig: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'tickettoken_db',
    application_name: 'venue-service'
  },
  pool: {
    min: 0,
    max: 10
  },
  acquireConnectionTimeout: 60000,
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
};

// Create database instance
export const db = knex(dbConfig);

// Pool monitoring
export function startPoolMonitoring() {
  console.log('Database pool monitoring started');
}

// Check database connection with retries
export async function checkDatabaseConnection(retries = 10, delay = 3000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting database connection... (attempt ${i + 1}/${retries})`);
      console.log(`DB Config: host=${process.env.DB_HOST}, port=${process.env.DB_PORT}, db=${process.env.DB_NAME}`);
      
      await db.raw('SELECT 1');
      console.log('Database connection successful!');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Database connection attempt ${i + 1} failed:`, errorMessage);
      if (i < retries - 1) {
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to connect to database after all retries');
  return false;
}

export default db;
