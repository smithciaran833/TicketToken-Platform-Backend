export interface IntegrationProvider {
  name: string;
  initialize(credentials: any): Promise<void>;
  testConnection(): Promise<boolean>;
  
  // Sync operations
  syncProducts?(products: any[]): Promise<any>;
  syncCustomers?(customers: any[]): Promise<any>;
  syncTransactions?(transactions: any[]): Promise<any>;
  syncInventory?(inventory: any[]): Promise<any>;
  
  // Fetch operations
  fetchProducts?(): Promise<any[]>;
  fetchCustomers?(): Promise<any[]>;
  fetchTransactions?(startDate: Date, endDate: Date): Promise<any[]>;
  
  // Webhook handling
  handleWebhook?(event: any): Promise<void>;
  validateWebhookSignature?(payload: string, signature: string): boolean;
  
  // OAuth
  getOAuthUrl?(state: string): string;
  exchangeCodeForToken?(code: string): Promise<any>;
  refreshToken?(refreshToken: string): Promise<any>;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors?: any[];
  duration: number;
}

export interface ProviderConfig {
  venueId: string;
  credentials: any;
  settings?: any;
  mappings?: any;
}
