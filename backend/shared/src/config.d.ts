export declare const baseEnv: Readonly<{
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    SERVICE_NAME: string;
    JWT_SECRET: string;
} & import("envalid").CleanedEnvAccessors>;
export declare const getDatabaseConfig: () => {
    connectionString: string;
    host?: undefined;
    port?: undefined;
    database?: undefined;
    user?: undefined;
    password?: undefined;
} | {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionString?: undefined;
};
export declare const getRedisConfig: () => string | {
    host: string;
    port: number;
    password: string | undefined;
};
export declare const getRabbitMQConfig: () => string;
export declare const getMongoDBConfig: () => string;
//# sourceMappingURL=config.d.ts.map