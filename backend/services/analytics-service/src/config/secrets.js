"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSecrets = loadSecrets;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../../.env') });
const secrets_manager_1 = require("../../../../shared/utils/secrets-manager");
const secrets_config_1 = require("../../../../shared/config/secrets.config");
async function loadSecrets() {
    const serviceName = process.env.SERVICE_NAME || 'unknown-service';
    console.log(`[${serviceName}] Loading secrets...`);
    try {
        const commonSecrets = [
            secrets_config_1.SECRETS_CONFIG.POSTGRES_PASSWORD,
            secrets_config_1.SECRETS_CONFIG.POSTGRES_USER,
            secrets_config_1.SECRETS_CONFIG.POSTGRES_DB,
            secrets_config_1.SECRETS_CONFIG.REDIS_PASSWORD,
        ];
        const secrets = await secrets_manager_1.secretsManager.getSecrets(commonSecrets);
        console.log(`[${serviceName}] ✅ Secrets loaded successfully`);
        return secrets;
    }
    catch (error) {
        console.error(`[${serviceName}] ❌ Failed to load secrets:`, error.message);
        throw new Error('Cannot start service without required secrets');
    }
}
//# sourceMappingURL=secrets.js.map