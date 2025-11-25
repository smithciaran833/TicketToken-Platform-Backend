import { PoolConfig } from 'pg';
interface SolanaConfig {
    rpcUrl: string;
    wsUrl?: string;
    commitment: string;
    network: string;
    programId?: string;
}
interface Config {
    solana: SolanaConfig;
    database: PoolConfig;
    redis: {
        host: string;
        port: number;
        password?: string;
        db: number;
    };
    service: {
        name: string;
        port: number;
        env: string;
    };
}
declare const config: Config;
export default config;
//# sourceMappingURL=index.d.ts.map