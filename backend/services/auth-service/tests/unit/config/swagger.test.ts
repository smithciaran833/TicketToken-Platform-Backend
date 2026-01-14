import { swaggerOptions, swaggerUiOptions } from '../../../src/config/swagger';

describe('swagger config', () => {
  describe('swaggerOptions', () => {
    it('should have openapi info', () => {
      expect(swaggerOptions.openapi.info).toBeDefined();
      expect(swaggerOptions.openapi.info.title).toBe('TicketToken Auth Service API');
      expect(swaggerOptions.openapi.info.version).toBe('1.0.0');
    });

    it('should have servers configured', () => {
      expect(swaggerOptions.openapi.servers).toBeDefined();
      expect(swaggerOptions.openapi.servers.length).toBeGreaterThan(0);
    });

    it('should have security schemes', () => {
      expect(swaggerOptions.openapi.components.securitySchemes).toBeDefined();
      expect(swaggerOptions.openapi.components.securitySchemes.bearerAuth).toBeDefined();
      expect(swaggerOptions.openapi.components.securitySchemes.bearerAuth.type).toBe('http');
      expect(swaggerOptions.openapi.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });

    it('should have tags', () => {
      expect(swaggerOptions.openapi.tags).toBeDefined();
      expect(swaggerOptions.openapi.tags.length).toBeGreaterThan(0);
      
      const tagNames = swaggerOptions.openapi.tags.map(t => t.name);
      expect(tagNames).toContain('auth');
      expect(tagNames).toContain('mfa');
      expect(tagNames).toContain('roles');
    });
  });

  describe('swaggerUiOptions', () => {
    it('should have route prefix', () => {
      expect(swaggerUiOptions.routePrefix).toBe('/docs');
    });

    it('should have UI config', () => {
      expect(swaggerUiOptions.uiConfig).toBeDefined();
      expect(swaggerUiOptions.uiConfig.docExpansion).toBe('list');
      expect(swaggerUiOptions.uiConfig.deepLinking).toBe(true);
    });

    it('should have CSP settings', () => {
      expect(swaggerUiOptions.staticCSP).toBe(true);
      expect(typeof swaggerUiOptions.transformStaticCSP).toBe('function');
    });

    it('should transform CSP header', () => {
      const header = 'test-header';
      expect(swaggerUiOptions.transformStaticCSP(header)).toBe(header);
    });
  });
});
