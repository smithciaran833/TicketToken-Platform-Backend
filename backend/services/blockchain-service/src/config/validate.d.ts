interface ValidationResult {
    valid: boolean;
    missing: string[];
    invalid: string[];
}
export declare function validateConfig(): ValidationResult;
export declare function validateConfigOrExit(): void;
export declare function testSolanaConnection(): Promise<boolean>;
export declare function getConfigSummary(): {
    service: string;
    port: string;
    nodeEnv: string;
    solanaNetwork: string | undefined;
    solanaRpcUrl: string | undefined;
    dbHost: string | undefined;
    dbName: string | undefined;
    redisHost: string | undefined;
    bundlrAddress: string;
    logLevel: string;
};
export {};
//# sourceMappingURL=validate.d.ts.map