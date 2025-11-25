import ProgramEventListener from './programListener';
import TransactionMonitor from './transactionMonitor';
declare class ListenerManager {
    private connection;
    private db;
    private listeners;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    getProgramListener(): ProgramEventListener | undefined;
    getTransactionMonitor(): TransactionMonitor | undefined;
    monitorTransaction(signature: string, metadata: any): Promise<void>;
    shutdown(): Promise<void>;
}
declare const _default: ListenerManager;
export default _default;
//# sourceMappingURL=index.d.ts.map