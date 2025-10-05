# DATABASE AUDIT: scanning-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "pg": "^8.11.3",
    "prom-client": "^15.1.3",
    "qrcode": "^1.5.4",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import { Pool, PoolClient } from 'pg';
import logger from '../utils/logger';

let pool: Pool | undefined;

export async function initializeDatabase(): Promise<Pool> {
  pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  try {
    const client: PoolClient = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('✅ Database connected:', result.rows[0].now);
    return pool;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/scanning-service//src/routes/policies.ts:14:      FROM scan_policy_templates
backend/services/scanning-service//src/routes/policies.ts:43:      FROM scan_policies sp
backend/services/scanning-service//src/routes/policies.ts:44:      JOIN events e ON sp.event_id = e.id
backend/services/scanning-service//src/routes/policies.ts:45:      LEFT JOIN venues v ON sp.venue_id = v.id
backend/services/scanning-service//src/routes/policies.ts:82:      SELECT * FROM scan_policies
backend/services/scanning-service//src/routes/policies.ts:122:      'SELECT venue_id FROM events WHERE id = $1',
backend/services/scanning-service//src/routes/policies.ts:141:        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
backend/services/scanning-service//src/routes/policies.ts:157:        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
backend/services/scanning-service//src/routes/policies.ts:172:        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
backend/services/scanning-service//src/routes/policies.ts:184:      SELECT * FROM scan_policies
backend/services/scanning-service//src/routes/devices.ts:13:      'SELECT * FROM devices WHERE is_active = true ORDER BY name'
backend/services/scanning-service//src/routes/devices.ts:44:      INSERT INTO devices (device_id, name, zone, is_active)
backend/services/scanning-service//src/routes/offline.ts:62:          SELECT id FROM scans
backend/services/scanning-service//src/routes/offline.ts:79:          'SELECT id FROM devices WHERE device_id = $1',
backend/services/scanning-service//src/routes/offline.ts:94:          INSERT INTO scans (ticket_id, device_id, result, reason, scanned_at)
backend/services/scanning-service//src/routes/offline.ts:107:            UPDATE tickets
backend/services/scanning-service//src/services/QRGenerator.ts:63:      const testResult = await pool.query('SELECT COUNT(*) as count FROM tickets');
backend/services/scanning-service//src/services/QRGenerator.ts:68:        'SELECT id, status, event_id FROM tickets WHERE id = $1',
backend/services/scanning-service//src/services/QRGenerator.ts:83:        FROM tickets t
backend/services/scanning-service//src/services/QRGenerator.ts:84:        JOIN events e ON t.event_id = e.id
backend/services/scanning-service//src/services/QRGenerator.ts:152:        FROM tickets t
backend/services/scanning-service//src/services/OfflineCache.js:32:        FROM tickets t
backend/services/scanning-service//src/services/OfflineCache.js:33:        JOIN events e ON t.event_id = e.id
backend/services/scanning-service//src/services/OfflineCache.js:49:            'UPDATE tickets SET qr_hmac_secret = $1 WHERE id = $2',
backend/services/scanning-service//src/services/OfflineCache.js:82:        'DELETE FROM offline_validation_cache WHERE event_id = $1 AND valid_until < NOW()',
backend/services/scanning-service//src/services/OfflineCache.js:89:          INSERT INTO offline_validation_cache (
backend/services/scanning-service//src/services/OfflineCache.js:138:        'SELECT * FROM scanner_devices WHERE device_id = $1 AND is_active = true AND can_scan_offline = true',
backend/services/scanning-service//src/services/OfflineCache.js:153:        FROM offline_validation_cache
backend/services/scanning-service//src/services/OfflineCache.js:161:        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
backend/services/scanning-service//src/services/OfflineCache.js:189:        SELECT * FROM offline_validation_cache
backend/services/scanning-service//src/services/QRValidator.ts:100:      FROM scans
backend/services/scanning-service//src/services/QRValidator.ts:131:      FROM scan_policies
backend/services/scanning-service//src/services/QRValidator.ts:244:        'SELECT * FROM devices WHERE device_id = $1 AND is_active = true',
backend/services/scanning-service//src/services/QRValidator.ts:266:        FROM tickets t
backend/services/scanning-service//src/services/QRValidator.ts:267:        JOIN events e ON t.event_id = e.id
backend/services/scanning-service//src/services/QRValidator.ts:316:        FROM scan_policies
backend/services/scanning-service//src/services/QRValidator.ts:374:        UPDATE tickets
backend/services/scanning-service//src/services/QRValidator.ts:431:      INSERT INTO scans (ticket_id, device_id, result, reason, scanned_at)
backend/services/scanning-service//src/services/QRValidator.ts:481:      FROM scans s
backend/services/scanning-service//src/services/QRValidator.ts:482:      JOIN tickets t ON s.ticket_id = t.id
backend/services/scanning-service//src/services/DeviceManager.js:17:        INSERT INTO scanner_devices (
backend/services/scanning-service//src/services/DeviceManager.js:60:        UPDATE scanner_devices
backend/services/scanning-service//src/services/DeviceManager.js:95:        'SELECT * FROM scanner_devices WHERE device_id = $1',
backend/services/scanning-service//src/services/DeviceManager.js:118:      let query = 'SELECT * FROM scanner_devices WHERE venue_id = $1';
backend/services/scanning-service//src/services/DeviceManager.js:145:        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES

## 6. ENVIRONMENT VARIABLES
```
# Database
DATABASE_URL=postgresql://tickettoken:CHANGE_ME@localhost:5432/tickettoken_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=tickettoken
DB_PASSWORD=CHANGE_ME
```

---

