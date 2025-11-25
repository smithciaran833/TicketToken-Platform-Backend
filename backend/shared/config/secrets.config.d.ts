export declare const SECRETS_CONFIG: {
    POSTGRES_PASSWORD: {
        secretName: string;
        envVarName: string;
    };
    POSTGRES_USER: {
        secretName: string;
        envVarName: string;
    };
    POSTGRES_DB: {
        secretName: string;
        envVarName: string;
    };
    REDIS_PASSWORD: {
        secretName: string;
        envVarName: string;
    };
    RABBITMQ_USER: {
        secretName: string;
        envVarName: string;
    };
    RABBITMQ_PASSWORD: {
        secretName: string;
        envVarName: string;
    };
    MONGO_ROOT_USER: {
        secretName: string;
        envVarName: string;
    };
    MONGO_ROOT_PASSWORD: {
        secretName: string;
        envVarName: string;
    };
    INFLUXDB_ADMIN_PASSWORD: {
        secretName: string;
        envVarName: string;
    };
    INFLUXDB_ADMIN_TOKEN: {
        secretName: string;
        envVarName: string;
    };
    JWT_ACCESS_SECRET: {
        secretName: string;
        envVarName: string;
    };
    JWT_REFRESH_SECRET: {
        secretName: string;
        envVarName: string;
    };
    STRIPE_SECRET_KEY: {
        secretName: string;
        envVarName: string;
    };
    STRIPE_PUBLISHABLE_KEY: {
        secretName: string;
        envVarName: string;
    };
    STRIPE_WEBHOOK_SECRET: {
        secretName: string;
        envVarName: string;
    };
    SENDGRID_API_KEY: {
        secretName: string;
        envVarName: string;
    };
    TWILIO_ACCOUNT_SID: {
        secretName: string;
        envVarName: string;
    };
    TWILIO_AUTH_TOKEN: {
        secretName: string;
        envVarName: string;
    };
    INTERNAL_SERVICE_SECRET: {
        secretName: string;
        envVarName: string;
    };
};
export type SecretKey = keyof typeof SECRETS_CONFIG;
//# sourceMappingURL=secrets.config.d.ts.map