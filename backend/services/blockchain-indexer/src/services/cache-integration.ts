import { createCache } from '../../../../shared/src/cache/dist/index';

const cache = createCache({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'blockchain:',
  }
});

export default cache;
