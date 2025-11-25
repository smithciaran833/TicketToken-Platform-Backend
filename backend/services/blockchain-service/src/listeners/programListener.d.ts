import { BaseListener } from './baseListener';
import { Connection } from '@solana/web3.js';
import { Pool } from 'pg';
interface LogEvent {
    type: string;
    data: any;
}
interface LogsContext {
    signature: string;
    slot: number;
    logs: string[];
    err: any;
}
export declare class ProgramEventListener extends BaseListener {
    private programId;
    constructor(connection: Connection, db: Pool, programId: string);
    setupSubscriptions(): Promise<void>;
    processLogs(logs: LogsContext): Promise<void>;
    parseEvents(logs: string[]): LogEvent[];
    extractEventData(log: string): any;
    processEvent(event: LogEvent, signature: string): Promise<void>;
    handleTicketMinted(data: any, signature: string): Promise<void>;
    handleTicketTransferred(data: any, signature: string): Promise<void>;
    handleTicketUsed(data: any, signature: string): Promise<void>;
    storeRawLogs(logs: LogsContext): Promise<void>;
}
export default ProgramEventListener;
//# sourceMappingURL=programListener.d.ts.map