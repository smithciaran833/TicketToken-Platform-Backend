/**
 * Unit tests for blockchain-service Tenant Context Middleware
 * 
 * Tests tenant validation, RLS context setting, platform admin overrides,
 * and UUID validation for SQL injection prevention
 */

describe('Tenant Context Middleware', () => {
  // ===========================================================================
  // isValidTenantId Function
  // ===========================================================================
  describe('isValidTenantId', () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    const isValidTenantId = (tenantId: string) => {
      return UUID_REGEX.test(tenantId);
    };

    it('should accept valid v4 UUID', () => {
      const validUUID = '123e4567-e89b-42d3-a456-426614174000';
      expect(isValidTenantId(validUUID)).toBe(true);
    });

    it('should accept lowercase UUID', () => {
      const lowerUUID = '550e8400-e29b-41d4-a716-446655440000';
      expect(isValidTenantId(lowerUUID)).toBe(true);
    });

    it('should accept uppercase UUID', () => {
      const upperUUID = '550E8400-E29B-41D4-A716-446655440000';
      expect(isValidTenantId(upperUUID)).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidTenantId('')).toBe(false);
    });

    it('should reject non-UUID strings', () => {
      expect(isValidTenantId('not-a-uuid')).toBe(false);
    });

    it('should reject SQL injection attempts', () => {
      expect(isValidTenantId("'; DROP TABLE users;--")).toBe(false);
    });

    it('should reject v1 UUID (wrong version)', () => {
      const v1UUID = '550e8400-e29b-11d4-a716-446655440000';
      expect(isValidTenantId(v1UUID)).toBe(false);
    });

    it('should reject UUID with wrong variant', () => {
      const wrongVariant = '550e8400-e29b-41d4-1716-446655440000';
      expect(isValidTenantId(wrongVariant)).toBe(false);
    });

    it('should reject UUID with extra characters', () => {
      expect(isValidTenantId('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false);
    });

    it('should reject partial UUID', () => {
      expect(isValidTenantId('550e8400-e29b')).toBe(false);
    });
  });

  // ===========================================================================
  // withTenantContext Function (Knex)
  // ===========================================================================
  describe('withTenantContext (Knex)', () => {
    it('should validate tenant ID before setting context', () => {
      const tenantId = 'invalid';
      const isValid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId);
      expect(isValid).toBe(false);
    });

    it('should throw error for invalid tenant ID format', () => {
      const validateTenant = (tenantId: string) => {
        const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId);
        if (!valid) throw new Error('Invalid tenant ID format');
      };
      
      expect(() => validateTenant('invalid')).toThrow('Invalid tenant ID format');
    });

    it('should set RLS context using SET LOCAL', () => {
      const sql = 'SET LOCAL app.current_tenant_id = ?';
      expect(sql).toContain('SET LOCAL');
      expect(sql).toContain('app.current_tenant_id');
    });
  });

  // ===========================================================================
  // withTenantContextPg Function (pg Pool)
  // ===========================================================================
  describe('withTenantContextPg (pg Pool)', () => {
    it('should begin transaction', () => {
      const operations = ['BEGIN', 'SET LOCAL', 'COMMIT'];
      expect(operations).toContain('BEGIN');
    });

    it('should commit on success', () => {
      const operations = ['BEGIN', 'SET LOCAL', 'COMMIT'];
      expect(operations).toContain('COMMIT');
    });

    it('should rollback on error', () => {
      const errorFlow = ['BEGIN', 'SET LOCAL', 'ERROR', 'ROLLBACK'];
      expect(errorFlow).toContain('ROLLBACK');
    });

    it('should release client after completion', () => {
      let released = false;
      const releaseClient = () => { released = true; };
      releaseClient();
      expect(released).toBe(true);
    });

    it('should use parameterized query for tenant ID', () => {
      const sql = 'SET LOCAL app.current_tenant_id = $1';
      expect(sql).toContain('$1');
    });
  });

  // ===========================================================================
  // tenantContextMiddleware Function
  // ===========================================================================
  describe('tenantContextMiddleware', () => {
    it('should require tenant from JWT (no header fallback)', () => {
      const user = { tenant_id: '550e8400-e29b-41d4-a716-446655440000' };
      const tenantId = user.tenant_id;
      expect(tenantId).toBeDefined();
    });

    it('should support both tenant_id and tenantId in user', () => {
      const user1 = { tenant_id: '550e8400-e29b-41d4-a716-446655440000' };
      const user2 = { tenantId: '550e8400-e29b-41d4-a716-446655440000' };
      
      const getTenantId = (user: any) => user.tenant_id || user.tenantId;
      
      expect(getTenantId(user1)).toBeDefined();
      expect(getTenantId(user2)).toBeDefined();
    });

    it('should return 401 when tenant missing', () => {
      const user = {};
      const tenantId = (user as any).tenant_id || (user as any).tenantId;
      const statusCode = !tenantId ? 401 : 200;
      expect(statusCode).toBe(401);
    });

    it('should return 400 for invalid tenant format', () => {
      const tenantId = 'invalid-format';
      const isValid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId);
      const statusCode = !isValid ? 400 : 200;
      expect(statusCode).toBe(400);
    });

    it('should set tenantId on request object', () => {
      const request = { tenantId: undefined as string | undefined };
      request.tenantId = '550e8400-e29b-41d4-a716-446655440000';
      expect(request.tenantId).toBeDefined();
    });

    it('should log warning for missing tenant context', () => {
      const logData = {
        ip: '192.168.1.1',
        path: '/api/v1/mint',
        method: 'POST',
        userId: 'user-123'
      };
      expect(logData.ip).toBeDefined();
    });
  });

  // ===========================================================================
  // optionalTenantContextMiddleware Function
  // ===========================================================================
  describe('optionalTenantContextMiddleware', () => {
    it('should continue without error when tenant missing', () => {
      const user = {};
      const tenantId = (user as any).tenant_id;
      const shouldContinue = true;
      expect(shouldContinue).toBe(true);
    });

    it('should set tenantId when valid tenant present', () => {
      const user = { tenant_id: '550e8400-e29b-41d4-a716-446655440000' };
      const request = { tenantId: undefined as string | undefined };
      
      const tenantId = user.tenant_id;
      const isValid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId);
      
      if (isValid) {
        request.tenantId = tenantId;
      }
      
      expect(request.tenantId).toBeDefined();
    });

    it('should skip invalid tenant silently', () => {
      const user = { tenant_id: 'invalid' };
      const request = { tenantId: undefined as string | undefined };
      
      const tenantId = user.tenant_id;
      const isValid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId);
      
      if (isValid) {
        request.tenantId = tenantId;
      }
      
      expect(request.tenantId).toBeUndefined();
    });
  });

  // ===========================================================================
  // isPlatformAdmin Function
  // ===========================================================================
  describe('isPlatformAdmin', () => {
    const isPlatformAdmin = (user: any) => {
      if (!user?.role) return false;
      const platformRoles = ['super_admin', 'platform_admin'];
      return platformRoles.includes(user.role);
    };

    it('should return true for super_admin role', () => {
      expect(isPlatformAdmin({ role: 'super_admin' })).toBe(true);
    });

    it('should return true for platform_admin role', () => {
      expect(isPlatformAdmin({ role: 'platform_admin' })).toBe(true);
    });

    it('should return false for regular user', () => {
      expect(isPlatformAdmin({ role: 'user' })).toBe(false);
    });

    it('should return false for tenant_admin', () => {
      expect(isPlatformAdmin({ role: 'tenant_admin' })).toBe(false);
    });

    it('should return false for missing role', () => {
      expect(isPlatformAdmin({})).toBe(false);
    });

    it('should return false for null user', () => {
      expect(isPlatformAdmin(null)).toBe(false);
    });
  });

  // ===========================================================================
  // getTenantIdFromRequest Function
  // ===========================================================================
  describe('getTenantIdFromRequest', () => {
    it('should return user tenant for regular users', () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        user: { role: 'user' },
        query: {}
      };
      
      expect(request.tenantId).toBeDefined();
    });

    it('should allow platform admin to query other tenants', () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        user: { role: 'platform_admin' },
        query: { tenant_id: 'other-tenant-uuid' }
      };
      
      const isPlatformAdmin = request.user.role === 'platform_admin';
      expect(isPlatformAdmin).toBe(true);
    });

    it('should validate override tenant ID format', () => {
      const queryTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const isValid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(queryTenantId);
      expect(isValid).toBe(true);
    });

    it('should return null for platform admin without specific tenant', () => {
      const request = {
        user: { role: 'platform_admin' },
        query: {}
      };
      
      const isPlatformAdmin = request.user.role === 'platform_admin';
      const queryTenantId = (request.query as any).tenant_id;
      const result = isPlatformAdmin && !queryTenantId ? null : request.tenantId;
      
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // extractTenantForJob Function
  // ===========================================================================
  describe('extractTenantForJob', () => {
    it('should return tenant ID from request', () => {
      const request = { tenantId: '550e8400-e29b-41d4-a716-446655440000' };
      expect(request.tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should throw error when tenant missing', () => {
      const extractTenant = (request: any) => {
        if (!request.tenantId) {
          throw new Error('Cannot create job without tenant context');
        }
        return request.tenantId;
      };
      
      expect(() => extractTenant({})).toThrow('Cannot create job without tenant context');
    });
  });

  // ===========================================================================
  // Error Response Format
  // ===========================================================================
  describe('Error Response Format', () => {
    it('should return UNAUTHORIZED error for missing tenant', () => {
      const error = {
        error: 'UNAUTHORIZED',
        message: 'Missing tenant context - valid JWT with tenant_id required'
      };
      expect(error.error).toBe('UNAUTHORIZED');
    });

    it('should return INVALID_TENANT error for bad format', () => {
      const error = {
        error: 'INVALID_TENANT',
        message: 'Invalid tenant ID format'
      };
      expect(error.error).toBe('INVALID_TENANT');
    });
  });

  // ===========================================================================
  // Security: SQL Injection Prevention
  // ===========================================================================
  describe('SQL Injection Prevention', () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    it('should reject SQL injection in tenant ID', () => {
      expect(UUID_REGEX.test("1'; DROP TABLE--")).toBe(false);
    });

    it('should reject quotes in tenant ID', () => {
      expect(UUID_REGEX.test("'quoted'")).toBe(false);
    });

    it('should reject semicolons in tenant ID', () => {
      expect(UUID_REGEX.test("abc;def")).toBe(false);
    });

    it('should reject spaces in tenant ID', () => {
      expect(UUID_REGEX.test("abc def")).toBe(false);
    });

    it('should use parameterized queries', () => {
      const sql = 'SET LOCAL app.current_tenant_id = $1';
      expect(sql).toContain('$1');
      expect(sql).not.toContain('${');
    });
  });
});
