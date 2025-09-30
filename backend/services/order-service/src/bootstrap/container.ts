import { Pool } from 'pg';

// Initialize database connection
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://tickettoken:4cVXNcP3zWIEmy8Ey1DfvWHYI@postgres:5432/tickettoken_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Since order-service seems simpler, we'll create a basic service
class OrderService {
  constructor() {}
  
  async createOrder(data: any) {
    // Implementation will use the db connection
    return { id: 'order-id', ...data };
  }
  
  async getOrder(id: string) {
    // Implementation
    return { id };
  }
}

const orderService = new OrderService();

// Export container
export const container = {
  db: dbPool,
  services: {
    orderService,
  },
};

// Boot-time validation
export function validateContainer(): void {
  if (!container.services.orderService) {
    throw new Error('OrderService not initialized');
  }
  
  console.log('✅ Order service container initialized successfully');
}
