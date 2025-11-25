"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseListener = void 0;
const events_1 = require("events");
class BaseListener extends events_1.EventEmitter {
    connection;
    db;
    subscriptions;
    isRunning;
    constructor(connection, db) {
        super();
        this.connection = connection;
        this.db = db;
        this.subscriptions = new Map();
        this.isRunning = false;
    }
    async start() {
        if (this.isRunning) {
            console.log('Listener already running');
            return;
        }
        this.isRunning = true;
        console.log(`Starting ${this.constructor.name}...`);
        await this.setupSubscriptions();
        console.log(`${this.constructor.name} started`);
    }
    async stop() {
        if (!this.isRunning)
            return;
        console.log(`Stopping ${this.constructor.name}...`);
        for (const [id, subscription] of this.subscriptions) {
            await this.connection.removeAccountChangeListener(subscription);
            this.subscriptions.delete(id);
        }
        this.isRunning = false;
        console.log(`${this.constructor.name} stopped`);
    }
    async setupSubscriptions() {
        throw new Error('setupSubscriptions must be implemented');
    }
    async handleError(error, context) {
        console.error(`Error in ${this.constructor.name}:`, error);
        console.error('Context:', context);
        try {
            await this.db.query(`
        INSERT INTO blockchain_events (
          event_type,
          program_id,
          event_data,
          processed,
          created_at
        )
        VALUES ('ERROR', $1, $2, false, NOW())
      `, [context.programId || 'unknown', JSON.stringify({ error: error.message, context })]);
        }
        catch (dbError) {
            console.error('Failed to log error to database:', dbError);
        }
    }
}
exports.BaseListener = BaseListener;
exports.default = BaseListener;
//# sourceMappingURL=baseListener.js.map