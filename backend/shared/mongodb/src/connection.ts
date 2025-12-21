import mongoose, { Connection, ConnectOptions } from 'mongoose';
import { MongoConnectionOptions } from './types';

/**
 * Default connection options
 */
const DEFAULT_OPTIONS: ConnectOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
};

/**
 * Create a MongoDB connection with retry logic
 * @param uri - MongoDB connection URI
 * @param options - Connection options
 * @param maxRetries - Maximum number of connection retries
 * @returns Mongoose Connection instance
 */
export async function createMongoConnection(
  uri: string,
  options: MongoConnectionOptions = {},
  maxRetries = 5
): Promise<Connection> {
  const connectionOptions: ConnectOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[MongoDB] Attempting connection (attempt ${attempt}/${maxRetries})...`);
      
      const connection = await mongoose.createConnection(uri, connectionOptions).asPromise();
      
      // Set up connection event handlers
      setupConnectionHandlers(connection);
      
      console.log(`[MongoDB] Successfully connected to database`);
      return connection;
    } catch (error) {
      lastError = error as Error;
      console.error(`[MongoDB] Connection attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        console.log(`[MongoDB] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw new Error(
    `Failed to connect to MongoDB after ${maxRetries} attempts. Last error: ${lastError?.message}`
  );
}

/**
 * Set up connection event handlers for monitoring
 */
function setupConnectionHandlers(connection: Connection): void {
  connection.on('connected', () => {
    console.log('[MongoDB] Connection established');
  });

  connection.on('disconnected', () => {
    console.warn('[MongoDB] Connection disconnected');
  });

  connection.on('reconnected', () => {
    console.log('[MongoDB] Connection reconnected');
  });

  connection.on('error', (error) => {
    console.error('[MongoDB] Connection error:', error);
  });

  connection.on('close', () => {
    console.log('[MongoDB] Connection closed');
  });
}

/**
 * Check if the MongoDB connection is healthy
 * @param connection - Mongoose Connection instance
 * @returns Promise<boolean> - True if healthy, false otherwise
 */
export async function healthCheck(connection: Connection): Promise<boolean> {
  try {
    if (connection.readyState !== 1) {
      return false;
    }

    // Ping the database
    if (connection.db) {
      await connection.db.admin().ping();
      return true;
    }
    return false;
  } catch (error) {
    console.error('[MongoDB] Health check failed:', error);
    return false;
  }
}

/**
 * Get detailed health information about the connection
 * @param connection - Mongoose Connection instance
 * @returns Promise with health details
 */
export async function getHealthDetails(connection: Connection): Promise<{
  status: string;
  readyState: number;
  host?: string;
  name?: string;
  ping?: boolean;
}> {
  const statusMap: { [key: number]: string } = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const health = {
    status: statusMap[connection.readyState] || 'unknown',
    readyState: connection.readyState,
    host: connection.host,
    name: connection.name,
    ping: false,
  };

  try {
    if (connection.readyState === 1 && connection.db) {
      await connection.db.admin().ping();
      health.ping = true;
    }
  } catch (error) {
    console.error('[MongoDB] Health details ping failed:', error);
  }

  return health;
}

/**
 * Gracefully close the MongoDB connection
 * @param connection - Mongoose Connection instance
 * @param timeout - Maximum time to wait for closure (ms)
 */
export async function gracefulShutdown(
  connection: Connection,
  timeout = 10000
): Promise<void> {
  console.log('[MongoDB] Initiating graceful shutdown...');

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Shutdown timeout exceeded')), timeout);
    });

    // Close the connection with timeout
    await Promise.race([
      connection.close(false), // false = don't force close
      timeoutPromise,
    ]);

    console.log('[MongoDB] Connection closed successfully');
  } catch (error) {
    console.error('[MongoDB] Error during graceful shutdown:', error);
    
    // Force close if graceful close failed
    try {
      await connection.close(true); // true = force close
      console.log('[MongoDB] Connection force closed');
    } catch (forceError) {
      console.error('[MongoDB] Failed to force close connection:', forceError);
      throw forceError;
    }
  }
}

/**
 * Get connection statistics
 * @param connection - Mongoose Connection instance
 * @returns Connection statistics
 */
export function getConnectionStats(connection: Connection): {
  readyState: number;
  status: string;
  host: string | undefined;
  name: string | undefined;
  models: string[];
} {
  const statusMap: { [key: number]: string } = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return {
    readyState: connection.readyState,
    status: statusMap[connection.readyState] || 'unknown',
    host: connection.host,
    name: connection.name,
    models: Object.keys(connection.models),
  };
}

/**
 * Wait for the connection to be ready
 * @param connection - Mongoose Connection instance
 * @param timeout - Maximum time to wait (ms)
 */
export async function waitForConnection(
  connection: Connection,
  timeout = 30000
): Promise<void> {
  if (connection.readyState === 1) {
    return; // Already connected
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Connection timeout exceeded'));
    }, timeout);

    const handleConnected = () => {
      clearTimeout(timeoutId);
      connection.removeListener('error', handleError);
      resolve();
    };

    const handleError = (error: Error) => {
      clearTimeout(timeoutId);
      connection.removeListener('connected', handleConnected);
      reject(error);
    };

    connection.once('connected', handleConnected);
    connection.once('error', handleError);

    // If already in error state
    if (connection.readyState === 0) {
      reject(new Error('Connection is in disconnected state'));
    }
  });
}

/**
 * Create multiple connections (for different databases)
 * @param configs - Array of connection configurations
 * @returns Promise with array of connections
 */
export async function createMultipleConnections(
  configs: Array<{
    name: string;
    uri: string;
    options?: MongoConnectionOptions;
  }>
): Promise<{ [key: string]: Connection }> {
  const connections: { [key: string]: Connection } = {};

  await Promise.all(
    configs.map(async (config) => {
      try {
        console.log(`[MongoDB] Creating connection for: ${config.name}`);
        const connection = await createMongoConnection(config.uri, config.options);
        connections[config.name] = connection;
      } catch (error) {
        console.error(`[MongoDB] Failed to create connection for ${config.name}:`, error);
        throw error;
      }
    })
  );

  return connections;
}

/**
 * Close multiple connections
 * @param connections - Map of connection name to Connection instance
 */
export async function closeMultipleConnections(
  connections: { [key: string]: Connection }
): Promise<void> {
  await Promise.all(
    Object.entries(connections).map(async ([name, connection]) => {
      try {
        console.log(`[MongoDB] Closing connection: ${name}`);
        await gracefulShutdown(connection);
      } catch (error) {
        console.error(`[MongoDB] Error closing connection ${name}:`, error);
      }
    })
  );
}

/**
 * Sleep utility for retry logic
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse MongoDB connection string to extract database name
 * @param uri - MongoDB connection URI
 * @returns Database name or undefined
 */
export function parseDatabaseName(uri: string): string | undefined {
  try {
    const url = new URL(uri);
    const dbName = url.pathname.split('/')[1]?.split('?')[0];
    return dbName || undefined;
  } catch (error) {
    console.error('[MongoDB] Failed to parse database name from URI:', error);
    return undefined;
  }
}

/**
 * Validate MongoDB connection URI format
 * @param uri - MongoDB connection URI
 * @returns True if valid, false otherwise
 */
export function validateConnectionUri(uri: string): boolean {
  try {
    if (!uri || typeof uri !== 'string') {
      return false;
    }

    // Check for mongodb:// or mongodb+srv:// protocol
    if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
      return false;
    }

    // Try to parse as URL
    new URL(uri);
    return true;
  } catch (error) {
    return false;
  }
}
