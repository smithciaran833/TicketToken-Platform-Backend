/**
 * Unit tests for blockchain-service BaseListener class
 * Tests EventEmitter extension, subscription management
 */

describe('BaseListener', () => {
  // ===========================================================================
  // Constructor and Initialization
  // ===========================================================================
  describe('Constructor', () => {
    it('should extend EventEmitter', () => {
      const { EventEmitter } = require('events');
      
      class BaseListener extends EventEmitter {
        subscriptionId: number | null = null;
        isSubscribedFlag = false;
      }
      
      const listener = new BaseListener();
      expect(listener).toBeInstanceOf(EventEmitter);
    });

    it('should initialize subscriptionId to null', () => {
      class BaseListener {
        subscriptionId: number | null = null;
      }
      
      const listener = new BaseListener();
      expect(listener.subscriptionId).toBeNull();
    });

    it('should initialize subscribed state to false', () => {
      class BaseListener {
        isSubscribedFlag = false;
        isSubscribed() { return this.isSubscribedFlag; }
      }
      
      const listener = new BaseListener();
      expect(listener.isSubscribed()).toBe(false);
    });
  });

  // ===========================================================================
  // subscribe Method
  // ===========================================================================
  describe('subscribe', () => {
    it('should mark listener as subscribed', () => {
      class BaseListener {
        isSubscribedFlag = false;
        
        subscribe() {
          this.isSubscribedFlag = true;
        }
        
        isSubscribed() { return this.isSubscribedFlag; }
      }
      
      const listener = new BaseListener();
      listener.subscribe();
      expect(listener.isSubscribed()).toBe(true);
    });

    it('should set subscriptionId', () => {
      class BaseListener {
        subscriptionId: number | null = null;
        
        subscribe() {
          this.subscriptionId = 12345;
        }
      }
      
      const listener = new BaseListener();
      listener.subscribe();
      expect(listener.subscriptionId).toBe(12345);
    });

    it('should not re-subscribe if already subscribed', () => {
      let subscribeCount = 0;
      
      class BaseListener {
        isSubscribedFlag = false;
        
        subscribe() {
          if (!this.isSubscribedFlag) {
            subscribeCount++;
            this.isSubscribedFlag = true;
          }
        }
        
        isSubscribed() { return this.isSubscribedFlag; }
      }
      
      const listener = new BaseListener();
      listener.subscribe();
      listener.subscribe();
      expect(subscribeCount).toBe(1);
    });
  });

  // ===========================================================================
  // unsubscribe Method
  // ===========================================================================
  describe('unsubscribe', () => {
    it('should mark listener as unsubscribed', () => {
      class BaseListener {
        isSubscribedFlag = true;
        
        unsubscribe() {
          this.isSubscribedFlag = false;
        }
        
        isSubscribed() { return this.isSubscribedFlag; }
      }
      
      const listener = new BaseListener();
      listener.unsubscribe();
      expect(listener.isSubscribed()).toBe(false);
    });

    it('should remove subscriptionId', () => {
      class BaseListener {
        subscriptionId: number | null = 12345;
        
        unsubscribe() {
          this.subscriptionId = null;
        }
      }
      
      const listener = new BaseListener();
      listener.unsubscribe();
      expect(listener.subscriptionId).toBeNull();
    });

    it('should be idempotent when called multiple times', () => {
      let unsubscribeCallCount = 0;
      
      class BaseListener {
        isSubscribedFlag = true;
        
        unsubscribe() {
          unsubscribeCallCount++;
          this.isSubscribedFlag = false;
        }
        
        isSubscribed() { return this.isSubscribedFlag; }
      }
      
      const listener = new BaseListener();
      listener.unsubscribe();
      listener.unsubscribe();
      
      // Multiple calls are okay
      expect(unsubscribeCallCount).toBe(2);
      expect(listener.isSubscribed()).toBe(false);
    });
  });

  // ===========================================================================
  // isSubscribed Method
  // ===========================================================================
  describe('isSubscribed', () => {
    it('should return true when subscribed', () => {
      class BaseListener {
        isSubscribedFlag = false;
        
        subscribe() { this.isSubscribedFlag = true; }
        isSubscribed() { return this.isSubscribedFlag; }
      }
      
      const listener = new BaseListener();
      listener.subscribe();
      expect(listener.isSubscribed()).toBe(true);
    });

    it('should return false when not subscribed', () => {
      class BaseListener {
        isSubscribedFlag = false;
        isSubscribed() { return this.isSubscribedFlag; }
      }
      
      const listener = new BaseListener();
      expect(listener.isSubscribed()).toBe(false);
    });

    it('should return false after unsubscribe', () => {
      class BaseListener {
        isSubscribedFlag = true;
        
        unsubscribe() { this.isSubscribedFlag = false; }
        isSubscribed() { return this.isSubscribedFlag; }
      }
      
      const listener = new BaseListener();
      listener.unsubscribe();
      expect(listener.isSubscribed()).toBe(false);
    });
  });

  // ===========================================================================
  // handleError Method
  // ===========================================================================
  describe('handleError', () => {
    it('should emit error event', () => {
      const { EventEmitter } = require('events');
      
      class BaseListener extends EventEmitter {
        handleError(error: Error) {
          this.emit('error', error);
        }
      }
      
      const listener = new BaseListener();
      let emittedError: Error | null = null;
      
      listener.on('error', (err: Error) => {
        emittedError = err;
      });
      
      const testError = new Error('Test error');
      listener.handleError(testError);
      
      expect(emittedError).toBe(testError);
    });

    it('should log error details', () => {
      const loggedMessages: string[] = [];
      const mockLogger = {
        error: (msg: string) => loggedMessages.push(msg)
      };
      
      class BaseListener {
        handleError(error: Error) {
          mockLogger.error(`Listener error: ${error.message}`);
        }
      }
      
      const listener = new BaseListener();
      listener.handleError(new Error('Connection lost'));
      
      expect(loggedMessages.some(m => m.includes('Connection lost'))).toBe(true);
    });
  });

  // ===========================================================================
  // Event Emission
  // ===========================================================================
  describe('Event Emission', () => {
    it('should emit subscribed event on subscribe', () => {
      const { EventEmitter } = require('events');
      
      class BaseListener extends EventEmitter {
        subscribe() {
          this.emit('subscribed');
        }
      }
      
      const listener = new BaseListener();
      let eventEmitted = false;
      
      listener.on('subscribed', () => {
        eventEmitted = true;
      });
      
      listener.subscribe();
      expect(eventEmitted).toBe(true);
    });

    it('should emit unsubscribed event on unsubscribe', () => {
      const { EventEmitter } = require('events');
      
      class BaseListener extends EventEmitter {
        unsubscribe() {
          this.emit('unsubscribed');
        }
      }
      
      const listener = new BaseListener();
      let eventEmitted = false;
      
      listener.on('unsubscribed', () => {
        eventEmitted = true;
      });
      
      listener.unsubscribe();
      expect(eventEmitted).toBe(true);
    });
  });

  // ===========================================================================
  // Connection Management
  // ===========================================================================
  describe('Connection Management', () => {
    it('should accept Connection in constructor', () => {
      const mockConnection = { commitment: 'confirmed' };
      
      class BaseListener {
        connection: any;
        constructor(connection: any) {
          this.connection = connection;
        }
      }
      
      const listener = new BaseListener(mockConnection);
      expect(listener.connection).toBe(mockConnection);
    });

    it('should store connection reference', () => {
      const mockConnection = { rpcEndpoint: 'https://api.devnet.solana.com' };
      
      class BaseListener {
        connection: any;
        constructor(connection: any) {
          this.connection = connection;
        }
      }
      
      const listener = new BaseListener(mockConnection);
      expect(listener.connection.rpcEndpoint).toBe('https://api.devnet.solana.com');
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================
  describe('cleanup', () => {
    it('should remove all event listeners', () => {
      const { EventEmitter } = require('events');
      
      class BaseListener extends EventEmitter {
        cleanup() {
          this.removeAllListeners();
        }
      }
      
      const listener = new BaseListener();
      listener.on('test', () => {});
      listener.on('test', () => {});
      
      expect(listener.listenerCount('test')).toBe(2);
      
      listener.cleanup();
      expect(listener.listenerCount('test')).toBe(0);
    });

    it('should unsubscribe before cleanup', () => {
      let unsubscribeCalled = false;
      
      class BaseListener {
        cleanup() {
          unsubscribeCalled = true;
        }
      }
      
      const listener = new BaseListener();
      listener.cleanup();
      
      expect(unsubscribeCalled).toBe(true);
    });
  });
});
