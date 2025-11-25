declare class SecretsManager {
    private client;
    private cache;
    private cacheTTL;
    constructor();
    getSecret(secretName: string, envVarName: string): Promise<string>;
    private getFromAWS;
    clearCache(): void;
    getSecrets(secrets: Array<{
        secretName: string;
        envVarName: string;
    }>): Promise<Record<string, string>>;
}
export declare const secretsManager: SecretsManager;
export { SecretsManager };
//# sourceMappingURL=secrets-manager.d.ts.map