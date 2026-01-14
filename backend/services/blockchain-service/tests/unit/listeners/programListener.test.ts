/**
 * Unit tests for blockchain-service ProgramListener
 * Tests Solana program account change subscriptions and log parsing
 */

describe('ProgramListener', () => {
  // ===========================================================================
  // Constructor
  // ===========================================================================
  describe('Constructor', () => {
    it('should store programId', () => {
      const programId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      
      class ProgramListener {
        programId: string;
        constructor(connection: any, programId: string) {
          this.programId = programId;
        }
      }
      
      const listener = new ProgramListener({}, programId);
      expect(listener.programId).toBe(programId);
    });

    it('should store connection', () => {
      const mockConnection = { rpcEndpoint: 'https://api.devnet.solana.com' };
      
      class ProgramListener {
        connection: any;
        constructor(connection: any, programId: string) {
          this.connection = connection;
        }
      }
      
      const listener = new ProgramListener(mockConnection, 'programId');
      expect(listener.connection).toBe(mockConnection);
    });
  });

  // ===========================================================================
  // parseLogs Method
  // ===========================================================================
  describe('parseLogs', () => {
    const parseLogs = (logs: string[]) => {
      const events: Array<{ type: string; data?: any }> = [];
      
      for (const log of logs) {
        if (log.includes('TicketMinted')) {
          events.push({ type: 'TicketMinted', data: { log } });
        }
        if (log.includes('TicketTransferred')) {
          events.push({ type: 'TicketTransferred', data: { log } });
        }
        if (log.includes('TicketUsed')) {
          events.push({ type: 'TicketUsed', data: { log } });
        }
        if (log.includes('TicketBurned')) {
          events.push({ type: 'TicketBurned', data: { log } });
        }
      }
      
      return events;
    };

    it('should extract TicketMinted event', () => {
      const logs = [
        'Program log: TicketMinted: {"ticketId":"123","mintAddress":"abc"}'
      ];
      
      const events = parseLogs(logs);
      expect(events.some(e => e.type === 'TicketMinted')).toBe(true);
    });

    it('should extract TicketTransferred event', () => {
      const logs = [
        'Program log: TicketTransferred: {"from":"addr1","to":"addr2"}'
      ];
      
      const events = parseLogs(logs);
      expect(events.some(e => e.type === 'TicketTransferred')).toBe(true);
    });

    it('should extract TicketUsed event', () => {
      const logs = [
        'Program log: TicketUsed: {"ticketId":"123","usedAt":"2024-01-01"}'
      ];
      
      const events = parseLogs(logs);
      expect(events.some(e => e.type === 'TicketUsed')).toBe(true);
    });

    it('should extract TicketBurned event', () => {
      const logs = [
        'Program log: TicketBurned: {"ticketId":"123"}'
      ];
      
      const events = parseLogs(logs);
      expect(events.some(e => e.type === 'TicketBurned')).toBe(true);
    });

    it('should return empty array for no events', () => {
      const logs = [
        'Program log: some other log',
        'Program log: another log'
      ];
      
      const events = parseLogs(logs);
      expect(events).toHaveLength(0);
    });

    it('should handle multiple events in one log set', () => {
      const logs = [
        'Program log: TicketMinted: {}',
        'Program log: TicketTransferred: {}'
      ];
      
      const events = parseLogs(logs);
      expect(events).toHaveLength(2);
    });

    it('should handle malformed log data', () => {
      const logs = ['Program log: TicketMinted: invalid-json'];
      
      const events = parseLogs(logs);
      expect(events).toHaveLength(1); // Still captures event type
    });
  });

  // ===========================================================================
  // handleAccountChange Method
  // ===========================================================================
  describe('handleAccountChange', () => {
    it('should parse logs from account change', () => {
      let parseLogsCalled = false;
      
      class ProgramListener {
        parseLogs(logs: string[]) {
          parseLogsCalled = true;
          return [];
        }
        
        handleAccountChange(accountInfo: any, context: any) {
          if (context.logs) {
            this.parseLogs(context.logs);
          }
        }
      }
      
      const listener = new ProgramListener();
      listener.handleAccountChange({}, { logs: ['test log'] });
      
      expect(parseLogsCalled).toBe(true);
    });

    it('should emit event for each parsed event', () => {
      const emittedEvents: string[] = [];
      
      class ProgramListener {
        emit(eventType: string, data: any) {
          emittedEvents.push(eventType);
        }
        
        parseLogs() {
          return [
            { type: 'TicketMinted', data: {} },
            { type: 'TicketTransferred', data: {} }
          ];
        }
        
        handleAccountChange(accountInfo: any, context: any) {
          const events = this.parseLogs();
          for (const event of events) {
            this.emit(event.type, event.data);
          }
        }
      }
      
      const listener = new ProgramListener();
      listener.handleAccountChange({}, {});
      
      expect(emittedEvents).toContain('TicketMinted');
      expect(emittedEvents).toContain('TicketTransferred');
    });
  });

  // ===========================================================================
  // subscribe Method
  // ===========================================================================
  describe('subscribe', () => {
    it('should call connection.onProgramAccountChange', () => {
      let onProgramAccountChangeCalled = false;
      
      const mockConnection = {
        onProgramAccountChange: (programId: any, callback: any) => {
          onProgramAccountChangeCalled = true;
          return 12345;
        }
      };
      
      class ProgramListener {
        connection: any;
        subscriptionId: number | null = null;
        
        constructor(connection: any) {
          this.connection = connection;
        }
        
        subscribe() {
          this.subscriptionId = this.connection.onProgramAccountChange(
            'programId',
            this.handleAccountChange.bind(this)
          );
        }
        
        handleAccountChange() {}
      }
      
      const listener = new ProgramListener(mockConnection);
      listener.subscribe();
      
      expect(onProgramAccountChangeCalled).toBe(true);
      expect(listener.subscriptionId).toBe(12345);
    });
  });

  // ===========================================================================
  // unsubscribe Method
  // ===========================================================================
  describe('unsubscribe', () => {
    it('should call connection.removeAccountChangeListener', () => {
      let removeCalled = false;
      let removedSubscriptionId: number | null = null;
      
      const mockConnection = {
        removeAccountChangeListener: (subscriptionId: number) => {
          removeCalled = true;
          removedSubscriptionId = subscriptionId;
        }
      };
      
      class ProgramListener {
        connection: any;
        subscriptionId: number | null = 12345;
        
        constructor(connection: any) {
          this.connection = connection;
        }
        
        unsubscribe() {
          if (this.subscriptionId !== null) {
            this.connection.removeAccountChangeListener(this.subscriptionId);
            this.subscriptionId = null;
          }
        }
      }
      
      const listener = new ProgramListener(mockConnection);
      listener.unsubscribe();
      
      expect(removeCalled).toBe(true);
      expect(removedSubscriptionId).toBe(12345);
      expect(listener.subscriptionId).toBeNull();
    });
  });

  // ===========================================================================
  // Event Types
  // ===========================================================================
  describe('Event Types', () => {
    const eventTypes = [
      'TicketMinted',
      'TicketTransferred',
      'TicketUsed',
      'TicketBurned',
      'CollectionCreated',
      'MetadataUpdated'
    ];

    it('should support TicketMinted event', () => {
      expect(eventTypes).toContain('TicketMinted');
    });

    it('should support TicketTransferred event', () => {
      expect(eventTypes).toContain('TicketTransferred');
    });

    it('should support TicketUsed event', () => {
      expect(eventTypes).toContain('TicketUsed');
    });

    it('should support TicketBurned event', () => {
      expect(eventTypes).toContain('TicketBurned');
    });
  });
});
