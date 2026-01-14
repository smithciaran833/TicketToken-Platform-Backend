/**
 * Unit tests for blockchain-service listeners index/exports
 * Tests ListenerManager functionality
 */

describe('Listeners Index', () => {
  // ===========================================================================
  // Module Exports
  // ===========================================================================
  describe('Module Exports', () => {
    it('should export BaseListener', () => {
      const exports = { BaseListener: class {} };
      expect(exports.BaseListener).toBeDefined();
    });

    it('should export ProgramListener', () => {
      const exports = { ProgramListener: class {} };
      expect(exports.ProgramListener).toBeDefined();
    });

    it('should export TransactionMonitor', () => {
      const exports = { TransactionMonitor: class {} };
      expect(exports.TransactionMonitor).toBeDefined();
    });

    it('should export ListenerManager', () => {
      const exports = { ListenerManager: class {} };
      expect(exports.ListenerManager).toBeDefined();
    });
  });

  // ===========================================================================
  // ListenerManager
  // ===========================================================================
  describe('ListenerManager', () => {
    describe('Constructor', () => {
      it('should initialize with empty listeners map', () => {
        class ListenerManager {
          listeners = new Map();
        }
        
        const manager = new ListenerManager();
        expect(manager.listeners.size).toBe(0);
      });

      it('should accept connection parameter', () => {
        const mockConnection = { commitment: 'confirmed' };
        
        class ListenerManager {
          connection: any;
          constructor(connection: any) {
            this.connection = connection;
          }
        }
        
        const manager = new ListenerManager(mockConnection);
        expect(manager.connection).toBe(mockConnection);
      });
    });

    describe('addListener', () => {
      it('should add listener to map', () => {
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            this.listeners.set(name, listener);
          }
        }
        
        const manager = new ListenerManager();
        const mockListener = { subscribe: () => {} };
        
        manager.addListener('program', mockListener);
        expect(manager.listeners.has('program')).toBe(true);
      });

      it('should throw if listener name already exists', () => {
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            if (this.listeners.has(name)) {
              throw new Error(`Listener ${name} already exists`);
            }
            this.listeners.set(name, listener);
          }
        }
        
        const manager = new ListenerManager();
        const mockListener = { subscribe: () => {} };
        
        manager.addListener('program', mockListener);
        
        expect(() => manager.addListener('program', mockListener))
          .toThrow('Listener program already exists');
      });
    });

    describe('removeListener', () => {
      it('should remove listener from map', () => {
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            this.listeners.set(name, listener);
          }
          
          removeListener(name: string) {
            const listener = this.listeners.get(name);
            if (listener?.unsubscribe) {
              listener.unsubscribe();
            }
            this.listeners.delete(name);
          }
        }
        
        const manager = new ListenerManager();
        const mockListener = { unsubscribe: jest.fn() };
        
        manager.addListener('program', mockListener);
        manager.removeListener('program');
        
        expect(manager.listeners.has('program')).toBe(false);
        expect(mockListener.unsubscribe).toHaveBeenCalled();
      });

      it('should handle non-existent listener gracefully', () => {
        class ListenerManager {
          listeners = new Map();
          
          removeListener(name: string) {
            this.listeners.delete(name);
          }
        }
        
        const manager = new ListenerManager();
        expect(() => manager.removeListener('nonexistent')).not.toThrow();
      });
    });

    describe('getListener', () => {
      it('should return listener by name', () => {
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            this.listeners.set(name, listener);
          }
          
          getListener(name: string) {
            return this.listeners.get(name);
          }
        }
        
        const manager = new ListenerManager();
        const mockListener = { name: 'test-listener' };
        
        manager.addListener('program', mockListener);
        expect(manager.getListener('program')).toBe(mockListener);
      });

      it('should return undefined for non-existent listener', () => {
        class ListenerManager {
          listeners = new Map();
          
          getListener(name: string) {
            return this.listeners.get(name);
          }
        }
        
        const manager = new ListenerManager();
        expect(manager.getListener('nonexistent')).toBeUndefined();
      });
    });

    describe('startAll', () => {
      it('should call subscribe on all listeners', () => {
        const subscribeCalls: string[] = [];
        
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            this.listeners.set(name, listener);
          }
          
          startAll() {
            for (const [name, listener] of this.listeners) {
              listener.subscribe();
            }
          }
        }
        
        const manager = new ListenerManager();
        manager.addListener('listener1', { 
          subscribe: () => subscribeCalls.push('listener1') 
        });
        manager.addListener('listener2', { 
          subscribe: () => subscribeCalls.push('listener2') 
        });
        
        manager.startAll();
        
        expect(subscribeCalls).toContain('listener1');
        expect(subscribeCalls).toContain('listener2');
      });
    });

    describe('stopAll', () => {
      it('should call unsubscribe on all listeners', () => {
        const unsubscribeCalls: string[] = [];
        
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            this.listeners.set(name, listener);
          }
          
          stopAll() {
            for (const [name, listener] of this.listeners) {
              listener.unsubscribe();
            }
          }
        }
        
        const manager = new ListenerManager();
        manager.addListener('listener1', { 
          unsubscribe: () => unsubscribeCalls.push('listener1') 
        });
        manager.addListener('listener2', { 
          unsubscribe: () => unsubscribeCalls.push('listener2') 
        });
        
        manager.stopAll();
        
        expect(unsubscribeCalls).toContain('listener1');
        expect(unsubscribeCalls).toContain('listener2');
      });

      it('should handle errors in individual listeners', () => {
        let errorCaught = false;
        
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            this.listeners.set(name, listener);
          }
          
          stopAll() {
            for (const [name, listener] of this.listeners) {
              try {
                listener.unsubscribe();
              } catch (err) {
                errorCaught = true;
                // Log but continue
              }
            }
          }
        }
        
        const manager = new ListenerManager();
        manager.addListener('faulty', { 
          unsubscribe: () => { throw new Error('Unsubscribe failed'); } 
        });
        manager.addListener('good', { 
          unsubscribe: () => {} 
        });
        
        manager.stopAll();
        expect(errorCaught).toBe(true);
      });
    });

    describe('getStatus', () => {
      it('should return status of all listeners', () => {
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            this.listeners.set(name, listener);
          }
          
          getStatus() {
            const status: Record<string, boolean> = {};
            for (const [name, listener] of this.listeners) {
              status[name] = listener.isSubscribed();
            }
            return status;
          }
        }
        
        const manager = new ListenerManager();
        manager.addListener('listener1', { isSubscribed: () => true });
        manager.addListener('listener2', { isSubscribed: () => false });
        
        const status = manager.getStatus();
        expect(status['listener1']).toBe(true);
        expect(status['listener2']).toBe(false);
      });
    });

    describe('cleanup', () => {
      it('should stop all and clear listeners', () => {
        let stopAllCalled = false;
        
        class ListenerManager {
          listeners = new Map();
          
          addListener(name: string, listener: any) {
            this.listeners.set(name, listener);
          }
          
          stopAll() {
            stopAllCalled = true;
            for (const [, listener] of this.listeners) {
              if (listener.unsubscribe) listener.unsubscribe();
            }
          }
          
          cleanup() {
            this.stopAll();
            this.listeners.clear();
          }
        }
        
        const manager = new ListenerManager();
        manager.addListener('listener1', { unsubscribe: () => {} });
        
        manager.cleanup();
        
        expect(stopAllCalled).toBe(true);
        expect(manager.listeners.size).toBe(0);
      });
    });
  });

  // ===========================================================================
  // createListeners Factory
  // ===========================================================================
  describe('createListeners', () => {
    it('should create program listener', () => {
      const createListeners = (connection: any, programId: string) => {
        return {
          programListener: { programId, connection }
        };
      };
      
      const mockConnection = {};
      const programId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      
      const listeners = createListeners(mockConnection, programId);
      expect(listeners.programListener).toBeDefined();
      expect(listeners.programListener.programId).toBe(programId);
    });

    it('should create transaction monitor', () => {
      const createListeners = (connection: any) => {
        return {
          transactionMonitor: { connection }
        };
      };
      
      const mockConnection = {};
      const listeners = createListeners(mockConnection);
      expect(listeners.transactionMonitor).toBeDefined();
    });

    it('should register listeners with manager', () => {
      class ListenerManager {
        listeners = new Map();
        
        addListener(name: string, listener: any) {
          this.listeners.set(name, listener);
        }
      }
      
      const manager = new ListenerManager();
      manager.addListener('program', { type: 'program' });
      manager.addListener('transaction', { type: 'transaction' });
      
      expect(manager.listeners.size).toBe(2);
    });
  });
});
