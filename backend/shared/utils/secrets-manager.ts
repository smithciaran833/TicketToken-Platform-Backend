import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

interface SecretCache {
  [key: string]: {
    value: string;
    timestamp: number;
  };
}

class SecretsManager {
  private client: SecretsManagerClient | null = null;
  private cache: SecretCache = {};
  private cacheTTL: number = 300000; // 5 minutes

  constructor() {
    // Only initialize AWS client if we're in production
    if (process.env.NODE_ENV === 'production') {
      this.client = new SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });
    }
  }

  /**
   * Get a secret from AWS Secrets Manager or fallback to environment variables
   * @param secretName - The name of the secret in AWS (e.g., 'tickettoken/production/postgres-password')
   * @param envVarName - The fallback environment variable name (e.g., 'POSTGRES_PASSWORD')
   */
  async getSecret(secretName: string, envVarName: string): Promise<string> {
    // LOCAL DEVELOPMENT: Use .env file
    if (process.env.NODE_ENV !== 'production') {
      const value = process.env[envVarName];
      if (!value) {
        throw new Error(`Environment variable ${envVarName} is not set`);
      }
      console.log(`[Secrets] Using .env value for ${envVarName}`);
      return value;
    }

    // PRODUCTION: Use AWS Secrets Manager with caching
    return this.getFromAWS(secretName, envVarName);
  }

  private async getFromAWS(secretName: string, envVarName: string): Promise<string> {
    // Check cache first
    const cached = this.cache[secretName];
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[Secrets] Using cached value for ${secretName}`);
      return cached.value;
    }

    if (!this.client) {
      throw new Error('AWS Secrets Manager client not initialized');
    }

    try {
      console.log(`[Secrets] Fetching from AWS: ${secretName}`);
      
      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await this.client.send(command);
      
      if (!response.SecretString) {
        throw new Error(`Secret ${secretName} has no value`);
      }

      // Cache the value
      this.cache[secretName] = {
        value: response.SecretString,
        timestamp: Date.now(),
      };

      return response.SecretString;
    } catch (error: any) {
      console.error(`[Secrets] Failed to fetch ${secretName} from AWS:`, error.message);
      
      // Fallback to environment variable if AWS fails
      const fallbackValue = process.env[envVarName];
      if (fallbackValue) {
        console.warn(`[Secrets] Using fallback .env value for ${envVarName}`);
        return fallbackValue;
      }

      throw new Error(`Failed to get secret ${secretName}: ${error.message}`);
    }
  }

  /**
   * Clear the cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cache = {};
    console.log('[Secrets] Cache cleared');
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(secrets: Array<{ secretName: string; envVarName: string }>): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    for (const { secretName, envVarName } of secrets) {
      results[envVarName] = await this.getSecret(secretName, envVarName);
    }

    return results;
  }
}

// Export a singleton instance
export const secretsManager = new SecretsManager();

// Export the class for testing
export { SecretsManager };
