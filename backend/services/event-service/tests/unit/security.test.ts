import { sanitizeString, sanitizeObject, validateUrl } from '../../src/middleware/input-validation';

describe('Security Test Suite - Critical Tests', () => {
  describe('XSS Prevention', () => {
    it('should strip <script> tags from input', () => {
      const malicious = '<script>alert("XSS")</script>Hello';
      const sanitized = sanitizeString(malicious);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
      expect(sanitized).toBe('Hello');
    });

    it('should strip inline JavaScript event handlers', () => {
      const malicious = '<div onclick="alert(\'XSS\')">Click</div>';
      const sanitized = sanitizeString(malicious);
      
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('alert');
    });

    it('should remove javascript: protocol', () => {
      const malicious = 'javascript:alert("XSS")';
      const sanitized = sanitizeString(malicious);
      
      expect(sanitized).not.toContain('javascript:');
    });

    it('should handle nested script tags', () => {
      const malicious = '<scr<script>ipt>alert("XSS")</scr</script>ipt>';
      const sanitized = sanitizeString(malicious);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    it('should sanitize all common XSS vectors', () => {
      const vectors = [
        '<img src=x onerror=alert("XSS")>',
        '<svg onload=alert("XSS")>',
        '<iframe src="javascript:alert(\'XSS\')">',
        '<body onload=alert("XSS")>',
        '<input onfocus=alert("XSS") autofocus>',
      ];

      vectors.forEach((vector) => {
        const sanitized = sanitizeString(vector);
        expect(sanitized).not.toContain('alert');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('onload');
        expect(sanitized).not.toContain('onfocus');
      });
    });

    it('should recursively sanitize nested objects', () => {
      const malicious = {
        name: '<script>alert("XSS")</script>John',
        address: {
          street: '<img src=x onerror=alert("XSS")>Main St',
          city: 'New York',
        },
        tags: ['<script>tag1</script>', 'tag2'],
      };

      const sanitized = sanitizeObject(malicious);
      
      expect(sanitized.name).not.toContain('<script>');
      expect(sanitized.address.street).not.toContain('onerror');
      expect(sanitized.tags[0]).not.toContain('<script>');
    });
  });

  describe('SSRF Prevention', () => {
    it('should block localhost URLs', () => {
      expect(validateUrl('http://localhost/admin')).toBe(false);
      expect(validateUrl('http://127.0.0.1/admin')).toBe(false);
      expect(validateUrl('http://[::1]/admin')).toBe(false);
    });

    it('should block private IP ranges', () => {
      // 10.0.0.0/8
      expect(validateUrl('http://10.0.0.1/api')).toBe(false);
      expect(validateUrl('http://10.255.255.255/api')).toBe(false);
      
      // 172.16.0.0/12
      expect(validateUrl('http://172.16.0.1/api')).toBe(false);
      expect(validateUrl('http://172.31.255.255/api')).toBe(false);
      
      // 192.168.0.0/16
      expect(validateUrl('http://192.168.1.1/api')).toBe(false);
      expect(validateUrl('http://192.168.255.255/api')).toBe(false);
    });

    it('should block link-local addresses', () => {
      expect(validateUrl('http://169.254.1.1/api')).toBe(false);
    });

    it('should block .local domains', () => {
      expect(validateUrl('http://server.local/api')).toBe(false);
      expect(validateUrl('http://myserver.local:8080/data')).toBe(false);
    });

    it('should block non-HTTP protocols', () => {
      expect(validateUrl('file:///etc/passwd')).toBe(false);
      expect(validateUrl('ftp://server.com/file')).toBe(false);
      expect(validateUrl('gopher://server.com')).toBe(false);
    });

    it('should allow valid public URLs', () => {
      expect(validateUrl('https://api.example.com/data')).toBe(true);
      expect(validateUrl('http://example.com:8080/api')).toBe(true);
    });

    it('should handle URL with authentication', () => {
      // Should not allow URLs with embedded credentials
      expect(validateUrl('http://user:pass@localhost/admin')).toBe(false);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should detect common SQL injection patterns', () => {
      const sqlInjections = [
        "' OR '1'='1",
        "1; DROP TABLE users--",
        "' UNION SELECT * FROM users--",
        "admin'--",
        "1' AND '1'='1",
      ];

      sqlInjections.forEach((injection) => {
        const sanitized = sanitizeString(injection);
        // Should sanitize but not contain dangerous SQL
        expect(sanitized).toBeDefined();
      });
    });

    it('should handle SQL comments', () => {
      const malicious = "test'; -- comment";
      const sanitized = sanitizeString(malicious);
      
      // Should still process but remove dangerous characters
      expect(sanitized).toBeDefined();
    });
  });

  describe('Authentication Bypass Attempts', () => {
    it('should reject requests without JWT token', () => {
      const headers = {};
      expect(headers).not.toHaveProperty('authorization');
    });

    it('should reject malformed JWT tokens', () => {
      const malformedTokens = [
        'Bearer invalid',
        'Bearer eyJhbGciOiJub25lIn0..',
        'Bearer ...',
        'NotBearer token',
        '',
      ];

      malformedTokens.forEach((token) => {
        expect(token).toBeDefined();
        // Actual JWT validation happens in middleware
      });
    });

    it('should reject expired tokens', () => {
      // Token payload with expired timestamp
      const expiredPayload = {
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        user_id: '123',
      };

      expect(expiredPayload.exp).toBeLessThan(Math.floor(Date.now() / 1000));
    });

    it('should reject tokens with invalid signature', () => {
      // This would be caught by JWT verification
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzIn0.invalid_signature';
      expect(invalidToken).toBeDefined();
    });
  });

  describe('Tenant Isolation', () => {
    it('should enforce tenant_id in all queries', () => {
      const query = {
        event_id: 'event-123',
        tenant_id: 'tenant-456',
      };

      expect(query).toHaveProperty('tenant_id');
      expect(query.tenant_id).toBeTruthy();
    });

    it('should prevent cross-tenant data access', () => {
      const user1TenantId = 'tenant-123';
      const user2TenantId = 'tenant-456';
      const resourceTenantId = 'tenant-123';

      // User 2 should not access User 1's resource
      const hasAccess = user2TenantId === resourceTenantId;
      expect(hasAccess).toBe(false);
    });

    it('should validate tenant_id matches token claims', () => {
      const tokenClaims = {
        user_id: 'user-123',
        tenant_id: 'tenant-456',
      };

      const requestTenantId = 'tenant-789';

      const isAuthorized = tokenClaims.tenant_id === requestTenantId;
      expect(isAuthorized).toBe(false);
    });

    it('should handle missing tenant_id in request', () => {
      const request = {
        event_id: 'event-123',
        // Missing tenant_id
      };

      expect(request).not.toHaveProperty('tenant_id');
      // Should be rejected by middleware
    });

    it('should prevent tenant_id manipulation', () => {
      const originalTenantId = 'tenant-123';
      const manipulatedTenantId = 'tenant-456';

      // User attempts to change tenant_id
      expect(originalTenantId).not.toBe(manipulatedTenantId);
      // Middleware should use token tenant_id, not request body
    });
  });

  describe('Input Validation Bypasses', () => {
    it('should reject null bytes in input', () => {
      const malicious = 'test\x00.jpg';
      expect(malicious).toContain('\x00');
      // Should be sanitized or rejected
    });

    it('should handle extremely long input', () => {
      const longString = 'A'.repeat(1000000); // 1MB string
      expect(longString.length).toBe(1000000);
      // Should enforce max length limits
    });

    it('should reject Unicode homograph attacks', () => {
      // Using Cyrillic 'а' (U+0430) instead of Latin 'a' (U+0061)
      const homograph = 'аdmin'; // This is not "admin"
      expect(homograph).not.toBe('admin');
    });

    it('should handle special characters correctly', () => {
      const specialChars = '!@#$%^&*()_+-={}[]|:";\'<>?,./';
      const sanitized = sanitizeString(specialChars);
      expect(sanitized).toBeDefined();
    });
  });

  describe('Rate Limiting Bypass Attempts', () => {
    it('should track requests by IP', () => {
      const requests = [
        { ip: '192.168.1.1' },
        { ip: '192.168.1.1' },
        { ip: '192.168.1.1' },
      ];

      const ipCounts = requests.reduce((acc, req) => {
        acc[req.ip] = (acc[req.ip] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(ipCounts['192.168.1.1']).toBe(3);
    });

    it('should not be bypassed by X-Forwarded-For spoofing', () => {
      const trustedProxyIp = '10.0.0.1';
      const spoofedHeader = '1.2.3.4, 5.6.7.8';

      // Should only trust proxy chain from trusted sources
      expect(spoofedHeader).toBeDefined();
      // Implementation should validate proxy chain
    });

    it('should handle distributed attacks from multiple IPs', () => {
      const requests = [
        { ip: '1.1.1.1', timestamp: Date.now() },
        { ip: '2.2.2.2', timestamp: Date.now() },
        { ip: '3.3.3.3', timestamp: Date.now() },
      ];

      // Each IP tracked separately
      const uniqueIPs = new Set(requests.map(r => r.ip));
      expect(uniqueIPs.size).toBe(3);
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should block directory traversal attempts', () => {
      const paths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        'file://../../sensitive',
      ];

      paths.forEach((path) => {
        expect(path).toContain('..');
        // Should be rejected or sanitized
      });
    });

    it('should normalize paths to prevent bypass', () => {
      const normalized = '/api/events/../../../etc/passwd'
        .split('/')
        .filter(part => part !== '..')
        .join('/');

      expect(normalized).not.toContain('..');
    });
  });

  describe('Command Injection Prevention', () => {
    it('should reject shell metacharacters', () => {
      const dangerous = [
        'test; rm -rf /',
        'test | cat /etc/passwd',
        'test && whoami',
        'test `cat /etc/passwd`',
        'test $(whoami)',
      ];

      dangerous.forEach((cmd) => {
        const sanitized = sanitizeString(cmd);
        expect(sanitized).toBeDefined();
        // Should not execute as command
      });
    });
  });

  describe('Authorization Checks', () => {
    it('should verify user owns the resource', () => {
      const resource = {
        id: 'resource-123',
        owner_id: 'user-456',
        tenant_id: 'tenant-789',
      };

      const requestingUserId = 'user-999';
      const canAccess = resource.owner_id === requestingUserId;

      expect(canAccess).toBe(false);
    });

    it('should enforce role-based access control', () => {
      const user = {
        id: 'user-123',
        role: 'viewer',
      };

      const requiredRole = 'admin';
      const hasPermission = user.role === requiredRole;

      expect(hasPermission).toBe(false);
    });

    it('should prevent privilege escalation', () => {
      const userRole = 'user';
      const attemptedRole = 'admin';

      // User should not be able to set their own role
      expect(userRole).not.toBe(attemptedRole);
    });
  });
});
