import { EventEmitter } from 'events';
import { Connection } from '@solana/web3.js';
import { Pool } from 'pg';
export declare class BaseListener extends EventEmitter {
    protected connection: Connection;
    protected db: Pool;
    protected subscriptions: Map<string, number>;
    protected isRunning: boolean;
    constructor(connection: Connection, db: Pool);
    start(): Promise<void>;
    stop(): Promise<void>;
    setupSubscriptions(): Promise<void>;
    handleError(error: Error, context: any): Promise<void>;
}
export default BaseListener;
//# sourceMappingURL=baseListener.d.ts.map