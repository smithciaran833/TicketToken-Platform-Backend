export interface PersistenceConfig {
  provider: 'redis' | 'postgresql';
  retentionDays: number;
  archiveCompleted: boolean;
  archiveLocation?: string;
}

export const PERSISTENCE_CONFIGS: Record<string, PersistenceConfig> = {
  'payment': {
    provider: 'postgresql',
    retentionDays: 90,
    archiveCompleted: true,
    archiveLocation: 'payment_archive'
  },
  'webhook': {
    provider: 'postgresql',
    retentionDays: 30,
    archiveCompleted: true,
    archiveLocation: 'webhook_archive'
  },
  'email': {
    provider: 'redis',
    retentionDays: 7,
    archiveCompleted: false
  },
  'notification': {
    provider: 'redis',
    retentionDays: 7,
    archiveCompleted: false
  },
  'minting': {
    provider: 'postgresql',
    retentionDays: 365,
    archiveCompleted: true,
    archiveLocation: 'blockchain_archive'
  },
  'default': {
    provider: 'redis',
    retentionDays: 14,
    archiveCompleted: false
  }
};

export function getPersistenceConfig(queueName: string): PersistenceConfig {
  const category = queueName.split('.')[0];
  return PERSISTENCE_CONFIGS[category] || PERSISTENCE_CONFIGS.default;
}

export const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: 'queue:'
};

export const POSTGRES_CONFIG = {
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
};
