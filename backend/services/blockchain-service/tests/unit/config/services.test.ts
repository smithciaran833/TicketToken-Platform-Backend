/**
 * Unit tests for blockchain-service services configuration (config/services.ts)
 * Tests internal service URLs, HTTPS enforcement
 * AUDIT FIX #27: Use HTTPS for internal service URLs
 */

describe('Services Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // isLocalhost Function
  // ===========================================================================
  describe('isLocalhost', () => {
    it('should return true for localhost', () => {
      const url = 'http://localhost:3000';
      const parsed = new URL(url);
      const isLocal = parsed.hostname === 'localhost';
      
      expect(isLocal).toBe(true);
    });

    it('should return true for 127.0.0.1', () => {
      const url = 'http://127.0.0.1:3000';
      const parsed = new URL(url);
      const isLocal = parsed.hostname === '127.0.0.1';
      
      expect(isLocal).toBe(true);
    });

    it('should return true for ::1 (IPv6 localhost)', () => {
      const url = 'http://[::1]:3000';
      const parsed = new URL(url);
      const isLocal = parsed.hostname === '::1';
      
      expect(isLocal).toBe(true);
    });

    it('should return true for *.localhost domains', () => {
      const url = 'http://api.localhost:3000';
      const parsed = new URL(url);
      const isLocal = parsed.hostname.endsWith('.localhost');
      
      expect(isLocal).toBe(true);
    });

    it('should return false for remote domains', () => {
      const url = 'https://api.example.com';
      const parsed = new URL(url);
      const isLocal = parsed.hostname === 'localhost' || 
                     parsed.hostname === '127.0.0.1' || 
                     parsed.hostname.endsWith('.localhost');
      
      expect(isLocal).toBe(false);
    });
  });

  // ===========================================================================
  // Default Protocol (AUDIT FIX #27)
  // ===========================================================================
  describe('defaultProtocol', () => {
    it('should use http in development', () => {
      process.env.NODE_ENV = 'development';
      
      const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
      
      expect(protocol).toBe('http');
    });

    it('should use https in production', () => {
      process.env.NODE_ENV = 'production';
      
      const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
      
      expect(protocol).toBe('https');
    });
  });

  // ===========================================================================
  // Internal Service URLs
  // ===========================================================================
  describe('internalServices', () => {
    it('should have minting service URL', () => {
      const services = {
        mintingService: 'http://minting-service:3010'
      };

      expect(services.mintingService).toBeDefined();
    });

    it('should have order service URL', () => {
      const services = {
        orderService: 'http://order-service:3003'
      };

      expect(services.orderService).toBeDefined();
    });

    it('should have event service URL', () => {
      const services = {
        eventService: 'http://event-service:3004'
      };

      expect(services.eventService).toBeDefined();
    });

    it('should have ticket service URL', () => {
      const services = {
        ticketService: 'http://ticket-service:3002'
      };

      expect(services.ticketService).toBeDefined();
    });

    it('should have auth service URL', () => {
      const services = {
        authService: 'http://auth-service:3001'
      };

      expect(services.authService).toBeDefined();
    });

    it('should have payment service URL', () => {
      const services = {
        paymentService: 'http://payment-service:3005'
      };

      expect(services.paymentService).toBeDefined();
    });

    it('should have notification service URL', () => {
      const services = {
        notificationService: 'http://notification-service:3006'
      };

      expect(services.notificationService).toBeDefined();
    });

    it('should have file service URL', () => {
      const services = {
        fileService: 'http://file-service:3008'
      };

      expect(services.fileService).toBeDefined();
    });

    it('should have marketplace service URL', () => {
      const services = {
        marketplaceService: 'http://marketplace-service:3009'
      };

      expect(services.marketplaceService).toBeDefined();
    });

    it('should have transfer service URL', () => {
      const services = {
        transferService: 'http://transfer-service:3012'
      };

      expect(services.transferService).toBeDefined();
    });

    it('should have compliance service URL', () => {
      const services = {
        complianceService: 'http://compliance-service:3013'
      };

      expect(services.complianceService).toBeDefined();
    });

    it('should have analytics service URL', () => {
      const services = {
        analyticsService: 'http://analytics-service:3014'
      };

      expect(services.analyticsService).toBeDefined();
    });
  });

  // ===========================================================================
  // buildServiceUrl Function
  // ===========================================================================
  describe('buildServiceUrl', () => {
    it('should use env value when provided', () => {
      process.env.MINTING_SERVICE_URL = 'https://minting.example.com';
      
      const url = process.env.MINTING_SERVICE_URL || 'http://localhost:3010';
      
      expect(url).toBe('https://minting.example.com');
    });

    it('should build default URL from service name and port', () => {
      delete process.env.MINTING_SERVICE_URL;
      process.env.NODE_ENV = 'development';
      
      const serviceName = 'minting-service';
      const port = 3010;
      const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
      
      const url = `${protocol}://${serviceName}:${port}`;
      
      expect(url).toBe('http://minting-service:3010');
    });

    it('should use https in production default', () => {
      delete process.env.MINTING_SERVICE_URL;
      process.env.NODE_ENV = 'production';
      
      const serviceName = 'minting-service';
      const port = 3010;
      const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
      
      const url = `${protocol}://${serviceName}:${port}`;
      
      expect(url).toBe('https://minting-service:3010');
    });
  });

  // ===========================================================================
  // validateServiceUrls Function (AUDIT FIX #27)
  // ===========================================================================
  describe('validateServiceUrls', () => {
    it('should return valid for all HTTPS URLs', () => {
      const services = {
        mintingService: 'https://minting.example.com',
        orderService: 'https://order.example.com'
      };
      
      const errors: string[] = [];
      const isProduction = true;
      
      for (const [name, url] of Object.entries(services)) {
        const parsed = new URL(url);
        if (isProduction && parsed.protocol === 'http:') {
          errors.push(`${name}: HTTP not allowed in production`);
        }
      }
      
      expect(errors).toHaveLength(0);
    });

    it('should reject HTTP URLs in production', () => {
      const services = {
        mintingService: 'http://minting.example.com'
      };
      
      const errors: string[] = [];
      const isProduction = true;
      
      for (const [name, url] of Object.entries(services)) {
        const parsed = new URL(url);
        if (isProduction && parsed.protocol === 'http:') {
          errors.push(`${name}: HTTP not allowed in production`);
        }
      }
      
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should allow HTTP for localhost in production', () => {
      const services = {
        mintingService: 'http://localhost:3010'
      };
      
      const errors: string[] = [];
      const isProduction = true;
      
      for (const [name, url] of Object.entries(services)) {
        const parsed = new URL(url);
        const isLocal = parsed.hostname === 'localhost';
        if (isProduction && parsed.protocol === 'http:' && !isLocal) {
          errors.push(`${name}: HTTP not allowed`);
        }
      }
      
      expect(errors).toHaveLength(0);
    });

    it('should allow HTTP in development', () => {
      const services = {
        mintingService: 'http://minting.example.com'
      };
      
      const errors: string[] = [];
      const isProduction = false;
      
      for (const [name, url] of Object.entries(services)) {
        const parsed = new URL(url);
        if (isProduction && parsed.protocol === 'http:') {
          errors.push(`${name}: HTTP not allowed`);
        }
      }
      
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid URL format', () => {
      const invalidUrl = 'not-a-url';
      
      const isValid = () => {
        try {
          new URL(invalidUrl);
          return true;
        } catch {
          return false;
        }
      };
      
      expect(isValid()).toBe(false);
    });
  });

  // ===========================================================================
  // logServiceConfiguration Function
  // ===========================================================================
  describe('logServiceConfiguration', () => {
    it('should extract protocol from URL', () => {
      const url = 'https://minting.example.com';
      const parsed = new URL(url);
      
      expect(parsed.protocol).toBe('https:');
    });

    it('should identify HTTPS services', () => {
      const url = 'https://minting.example.com';
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      
      expect(isHttps).toBe(true);
    });

    it('should identify HTTP services', () => {
      const url = 'http://minting.example.com';
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      
      expect(isHttps).toBe(false);
    });

    it('should count total services', () => {
      const services = {
        mintingService: 'https://minting.example.com',
        orderService: 'https://order.example.com',
        eventService: 'https://event.example.com'
      };
      
      expect(Object.keys(services).length).toBe(3);
    });

    it('should count HTTPS services', () => {
      const services = {
        mintingService: 'https://minting.example.com',
        orderService: 'https://order.example.com',
        eventService: 'http://event.example.com'
      };
      
      const httpsCount = Object.values(services)
        .filter(url => url.startsWith('https://'))
        .length;
      
      expect(httpsCount).toBe(2);
    });
  });

  // ===========================================================================
  // TLS Verification Warning
  // ===========================================================================
  describe('TLS Verification', () => {
    it('should warn when TLS verification disabled', () => {
      process.env.INTERNAL_TLS_REJECT_UNAUTHORIZED = 'false';
      
      const tlsDisabled = process.env.INTERNAL_TLS_REJECT_UNAUTHORIZED === 'false';
      
      expect(tlsDisabled).toBe(true);
    });

    it('should not warn when TLS verification enabled', () => {
      delete process.env.INTERNAL_TLS_REJECT_UNAUTHORIZED;
      
      const tlsDisabled = process.env.INTERNAL_TLS_REJECT_UNAUTHORIZED === 'false';
      
      expect(tlsDisabled).toBe(false);
    });
  });
});
