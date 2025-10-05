# DATABASE AUDIT: ticket-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "node-cron": "^3.0.3",
    "pdfkit": "^0.14.0",
    "pg": "^8.16.3",
    "prom-client": "^15.1.3",
    "qrcode": "^1.5.3",
```

## 2. DATABASE CONFIGURATION FILES
### databaseService.ts
```typescript
import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private log = logger.child({ component: 'DatabaseService' });

  async initialize(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        max: config.database.pool?.max || 20,
        min: config.database.pool?.min || 2,
        idleTimeoutMillis: config.database.pool?.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.database.pool?.connectionTimeoutMillis || 5000
      });

      this.pool.on('error', (err) => {
        this.log.error('Database pool error:', err);
      });

      await this.pool.query('SELECT 1');
      this.log.info('Database service initialized');
    } catch (error) {
      this.log.error('Failed to initialize database service:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return this.pool;
  }

  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const result = await this.pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  async transaction<T = any>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/ticket-service//src/routes/webhookRoutes.ts:51:      `SELECT created_at FROM webhook_nonces 
backend/services/ticket-service//src/routes/webhookRoutes.ts:67:      `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
backend/services/ticket-service//src/routes/webhookRoutes.ts:73:    pool.query('DELETE FROM webhook_nonces WHERE expires_at < NOW()')
backend/services/ticket-service//src/routes/webhookRoutes.ts:91:          `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
backend/services/ticket-service//src/routes/mintRoutes.ts:37:      'SELECT status, tenant_id FROM orders WHERE id = $1',
backend/services/ticket-service//src/routes/internalRoutes.ts:114:          `UPDATE tickets
backend/services/ticket-service//src/routes/internalRoutes.ts:174:      FROM tickets t
backend/services/ticket-service//src/routes/internalRoutes.ts:175:      JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:46:        FROM reservations r
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:52:        UPDATE reservations
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:64:            FROM jsonb_array_elements(reservation.ticket_items)
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:67:                UPDATE ticket_types
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:75:        INSERT INTO reservation_history (
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:101:    UPDATE ticket_reservations
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:135:    FROM reservations r
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:136:    LEFT JOIN orders o ON r.order_id = o.id
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:153:    FROM reservations r
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:154:    JOIN orders o ON r.order_id = o.id
backend/services/ticket-service//src/migrations/005_reservation_cleanup.sql:170:    FROM reservations r
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:35:        FROM orders o
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:55:        FROM order_items oi
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:67:        FROM tickets t
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:68:        JOIN order_items oi ON oi.id = t.order_item_id
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:128:        FROM orders o
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:129:        LEFT JOIN events e ON o.event_id = e.id
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:195:        FROM tickets t
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:196:        JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/controllers/orders.controller.ts.backup:197:        JOIN events e ON t.event_id = e.id
backend/services/ticket-service//src/controllers/orders.controller.ts:35:        FROM orders o
backend/services/ticket-service//src/controllers/orders.controller.ts:55:        FROM order_items oi
backend/services/ticket-service//src/controllers/orders.controller.ts:67:        FROM tickets t
backend/services/ticket-service//src/controllers/orders.controller.ts:68:        JOIN order_items oi ON oi.id = t.order_item_id
backend/services/ticket-service//src/controllers/orders.controller.ts:128:        FROM orders o
backend/services/ticket-service//src/controllers/orders.controller.ts:129:        LEFT JOIN events e ON o.event_id = e.id
backend/services/ticket-service//src/controllers/orders.controller.ts:195:        FROM tickets t
backend/services/ticket-service//src/controllers/orders.controller.ts:196:        JOIN ticket_types tt ON t.ticket_type_id = tt.id
backend/services/ticket-service//src/controllers/orders.controller.ts:197:        JOIN events e ON t.event_id = e.id
backend/services/ticket-service//src/models/Reservation.ts:26:      INSERT INTO reservations (user_id, ticket_id, expires_at, status)
backend/services/ticket-service//src/models/Reservation.ts:36:    const query = 'SELECT * FROM reservations WHERE id = $1';
backend/services/ticket-service//src/models/Reservation.ts:43:      SELECT * FROM reservations
backend/services/ticket-service//src/models/Reservation.ts:68:    const query = `UPDATE reservations SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Reservation.ts:76:      UPDATE reservations
backend/services/ticket-service//src/models/Order.ts:34:      INSERT INTO orders (user_id, event_id, status, total_amount, currency, tickets, payment_id, metadata)
backend/services/ticket-service//src/models/Order.ts:48:    const query = 'SELECT * FROM orders WHERE id = $1';
backend/services/ticket-service//src/models/Order.ts:54:    const query = 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC';
backend/services/ticket-service//src/models/Order.ts:76:    const query = `UPDATE orders SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
backend/services/ticket-service//src/models/Order.ts:83:    const query = 'DELETE FROM orders WHERE id = $1';
backend/services/ticket-service//src/models/Ticket.ts:34:      INSERT INTO tickets (event_id, ticket_type_id, user_id, status, price, seat_number, barcode, metadata)
backend/services/ticket-service//src/models/Ticket.ts:48:    const query = 'SELECT * FROM tickets WHERE id = $1';
backend/services/ticket-service//src/models/Ticket.ts:54:    const query = 'SELECT * FROM tickets WHERE event_id = $1 ORDER BY created_at DESC';

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES

## 6. ENVIRONMENT VARIABLES
```
# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

