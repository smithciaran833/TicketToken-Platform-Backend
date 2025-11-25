"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretsManager = exports.secretsManager = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
class SecretsManager {
    client = null;
    cache = {};
    cacheTTL = 300000;
    constructor() {
        if (process.env.NODE_ENV === 'production') {
            this.client = new client_secrets_manager_1.SecretsManagerClient({
                region: process.env.AWS_REGION || 'us-east-1',
            });
        }
    }
    async getSecret(secretName, envVarName) {
        if (process.env.NODE_ENV !== 'production') {
            const value = process.env[envVarName];
            if (!value) {
                throw new Error(`Environment variable ${envVarName} is not set`);
            }
            console.log(`[Secrets] Using .env value for ${envVarName}`);
            return value;
        }
        return this.getFromAWS(secretName, envVarName);
    }
    async getFromAWS(secretName, envVarName) {
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
            const command = new client_secrets_manager_1.GetSecretValueCommand({
                SecretId: secretName,
            });
            const response = await this.client.send(command);
            if (!response.SecretString) {
                throw new Error(`Secret ${secretName} has no value`);
            }
            this.cache[secretName] = {
                value: response.SecretString,
                timestamp: Date.now(),
            };
            return response.SecretString;
        }
        catch (error) {
            console.error(`[Secrets] Failed to fetch ${secretName} from AWS:`, error.message);
            const fallbackValue = process.env[envVarName];
            if (fallbackValue) {
                console.warn(`[Secrets] Using fallback .env value for ${envVarName}`);
                return fallbackValue;
            }
            throw new Error(`Failed to get secret ${secretName}: ${error.message}`);
        }
    }
    clearCache() {
        this.cache = {};
        console.log('[Secrets] Cache cleared');
    }
    async getSecrets(secrets) {
        const results = {};
        for (const { secretName, envVarName } of secrets) {
            results[envVarName] = await this.getSecret(secretName, envVarName);
        }
        return results;
    }
}
exports.SecretsManager = SecretsManager;
exports.secretsManager = new SecretsManager();
//# sourceMappingURL=secrets-manager.js.map