const BaseListener = require('./baseListener');
const { PublicKey } = require('@solana/web3.js');

class ProgramEventListener extends BaseListener {
    constructor(connection, db, programId) {
        super(connection, db);
        this.programId = new PublicKey(programId);
    }
    
    async setupSubscriptions() {
        try {
            // Subscribe to program logs
            const logsSubscription = this.connection.onLogs(
                this.programId,
                async (logs) => {
                    await this.processLogs(logs);
                },
                'confirmed'
            );
            
            this.subscriptions.set('logs', logsSubscription);
            console.log(`Listening to program logs for ${this.programId.toString()}`);
            
        } catch (error) {
            await this.handleError(error, { programId: this.programId.toString() });
        }
    }
    
    async processLogs(logs) {
        try {
            console.log(`Processing logs for signature: ${logs.signature}`);
            
            // Store raw logs
            await this.storeRawLogs(logs);
            
            // Parse events from logs
            const events = this.parseEvents(logs.logs);
            
            // Process each event
            for (const event of events) {
                await this.processEvent(event, logs.signature);
            }
            
        } catch (error) {
            await this.handleError(error, { logs });
        }
    }
    
    parseEvents(logs) {
        const events = [];
        
        for (const log of logs) {
            // Look for specific event patterns
            if (log.includes('TicketMinted')) {
                events.push({
                    type: 'TICKET_MINTED',
                    data: this.extractEventData(log)
                });
            } else if (log.includes('TicketTransferred')) {
                events.push({
                    type: 'TICKET_TRANSFERRED',
                    data: this.extractEventData(log)
                });
            } else if (log.includes('TicketUsed')) {
                events.push({
                    type: 'TICKET_USED',
                    data: this.extractEventData(log)
                });
            }
        }
        
        return events;
    }
    
    extractEventData(log) {
        // Try to extract JSON data from log
        try {
            const jsonMatch = log.match(/\{.*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            // Not JSON, return raw log
        }
        return { raw: log };
    }
    
    async processEvent(event, signature) {
        console.log(`Processing event: ${event.type}`);
        
        // Store event in database
        await this.db.query(`
            INSERT INTO blockchain_events (
                event_type,
                program_id,
                transaction_signature,
                event_data,
                processed,
                created_at
            )
            VALUES ($1, $2, $3, $4, false, NOW())
        `, [event.type, this.programId.toString(), signature, JSON.stringify(event.data)]);
        
        // Emit event for other parts of the system
        this.emit('blockchain:event', { type: event.type, data: event.data, signature });
        
        // Handle specific event types
        switch (event.type) {
            case 'TICKET_MINTED':
                await this.handleTicketMinted(event.data, signature);
                break;
            case 'TICKET_TRANSFERRED':
                await this.handleTicketTransferred(event.data, signature);
                break;
            case 'TICKET_USED':
                await this.handleTicketUsed(event.data, signature);
                break;
        }
    }
    
    async handleTicketMinted(data, signature) {
        console.log('Ticket minted event:', data);
        // Update ticket in database if we have the ticket ID
        if (data.ticketId) {
            await this.db.query(`
                UPDATE tickets 
                SET on_chain_confirmed = true,
                    confirmation_signature = $1
                WHERE id = $2
            `, [signature, data.ticketId]);
        }
    }
    
    async handleTicketTransferred(data, signature) {
        console.log('Ticket transferred event:', data);
        // Record transfer in database
    }
    
    async handleTicketUsed(data, signature) {
        console.log('Ticket used event:', data);
        // Mark ticket as used
    }
    
    async storeRawLogs(logs) {
        // Store raw logs for debugging/audit
        await this.db.query(`
            INSERT INTO blockchain_events (
                event_type,
                program_id,
                transaction_signature,
                slot,
                event_data,
                processed,
                created_at
            )
            VALUES ('RAW_LOGS', $1, $2, $3, $4, true, NOW())
        `, [
            this.programId.toString(),
            logs.signature,
            logs.slot,
            JSON.stringify({ logs: logs.logs, err: logs.err })
        ]);
    }
}

module.exports = ProgramEventListener;
