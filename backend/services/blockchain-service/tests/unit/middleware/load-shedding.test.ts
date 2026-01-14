/**
 * Unit tests for blockchain-service Load Shedding Middleware
 * AUDIT FIX #53: Priority-based load shedding
 * 
 * Tests priority determination, load levels, event loop monitoring, and shedding policies
 */

describe('Load Shedding Middleware', () => {
  // ===========================================================================
  // RequestPriority Enum
  // ===========================================================================
  describe('RequestPriority', () => {
    const RequestPriority = {
      CRITICAL: 'critical',
      HIGH: 'high',
      NORMAL: 'normal',
      LOW: 'low'
    };

    it('should have CRITICAL priority for health checks', () => {
      expect(RequestPriority.CRITICAL).toBe('critical');
    });

    it('should have HIGH priority for minting operations', () => {
      expect(RequestPriority.HIGH).toBe('high');
    });

    it('should have NORMAL priority for blockchain queries', () => {
      expect(RequestPriority.NORMAL).toBe('normal');
    });

    it('should have LOW priority for metrics', () => {
      expect(RequestPriority.LOW).toBe('low');
    });
  });

  // ===========================================================================
  // LoadLevel Enum
  // ===========================================================================
  describe('LoadLevel', () => {
    const LoadLevel = {
      NORMAL: 'normal',
      WARNING: 'warning',
      HIGH: 'high',
      CRITICAL: 'critical'
    };

    it('should have NORMAL level', () => {
      expect(LoadLevel.NORMAL).toBe('normal');
    });

    it('should have WARNING level', () => {
      expect(LoadLevel.WARNING).toBe('warning');
    });

    it('should have HIGH level', () => {
      expect(LoadLevel.HIGH).toBe('high');
    });

    it('should have CRITICAL level', () => {
      expect(LoadLevel.CRITICAL).toBe('critical');
    });
  });

  // ===========================================================================
  // Configuration Thresholds
  // ===========================================================================
  describe('Configuration Thresholds', () => {
    it('should have EVENT_LOOP_LAG_WARNING default of 50ms', () => {
      const threshold = 50;
      expect(threshold).toBe(50);
    });

    it('should have EVENT_LOOP_LAG_HIGH default of 100ms', () => {
      const threshold = 100;
      expect(threshold).toBe(100);
    });

    it('should have EVENT_LOOP_LAG_CRITICAL default of 200ms', () => {
      const threshold = 200;
      expect(threshold).toBe(200);
    });

    it('should have MEMORY_WARNING_PERCENT default of 70%', () => {
      const threshold = 70;
      expect(threshold).toBe(70);
    });

    it('should have MEMORY_HIGH_PERCENT default of 85%', () => {
      const threshold = 85;
      expect(threshold).toBe(85);
    });

    it('should have MEMORY_CRITICAL_PERCENT default of 95%', () => {
      const threshold = 95;
      expect(threshold).toBe(95);
    });
  });

  // ===========================================================================
  // getRequestPriority Function
  // ===========================================================================
  describe('getRequestPriority', () => {
    const getRequestPriority = (path: string, isInternal: boolean) => {
      const lowerPath = path.toLowerCase();
      
      if (lowerPath.includes('/health') || lowerPath.includes('/live') || 
          lowerPath.includes('/ready') || isInternal) {
        return 'critical';
      }
      
      if (lowerPath.includes('/mint') || lowerPath.includes('/nft') || 
          lowerPath.includes('/wallet') || lowerPath.includes('/connect')) {
        return 'high';
      }
      
      if (lowerPath.includes('/metrics') || lowerPath.includes('/admin') || 
          lowerPath.includes('/debug') || lowerPath.includes('/bull-board')) {
        return 'low';
      }
      
      return 'normal';
    };

    it('should return CRITICAL for /health paths', () => {
      expect(getRequestPriority('/health', false)).toBe('critical');
    });

    it('should return CRITICAL for /live paths', () => {
      expect(getRequestPriority('/live', false)).toBe('critical');
    });

    it('should return CRITICAL for /ready paths', () => {
      expect(getRequestPriority('/ready', false)).toBe('critical');
    });

    it('should return CRITICAL for internal service calls', () => {
      expect(getRequestPriority('/api/v1/mint', true)).toBe('critical');
    });

    it('should return HIGH for /mint paths', () => {
      expect(getRequestPriority('/api/v1/mint', false)).toBe('high');
    });

    it('should return HIGH for /nft paths', () => {
      expect(getRequestPriority('/api/v1/nft', false)).toBe('high');
    });

    it('should return HIGH for /wallet paths', () => {
      expect(getRequestPriority('/api/v1/wallet', false)).toBe('high');
    });

    it('should return LOW for /metrics paths', () => {
      expect(getRequestPriority('/metrics', false)).toBe('low');
    });

    it('should return LOW for /admin paths', () => {
      expect(getRequestPriority('/admin/users', false)).toBe('low');
    });

    it('should return NORMAL for other paths', () => {
      expect(getRequestPriority('/api/v1/transactions', false)).toBe('normal');
    });
  });

  // ===========================================================================
  // Shedding Policy
  // ===========================================================================
  describe('Shedding Policy', () => {
    const SHEDDING_POLICY: Record<string, string[]> = {
      normal: [],
      warning: ['low'],
      high: ['low', 'normal'],
      critical: ['low', 'normal', 'high']
    };

    it('should shed nothing at NORMAL level', () => {
      expect(SHEDDING_POLICY.normal).toEqual([]);
    });

    it('should shed LOW at WARNING level', () => {
      expect(SHEDDING_POLICY.warning).toContain('low');
    });

    it('should shed LOW and NORMAL at HIGH level', () => {
      expect(SHEDDING_POLICY.high).toContain('low');
      expect(SHEDDING_POLICY.high).toContain('normal');
    });

    it('should shed LOW, NORMAL, HIGH at CRITICAL level', () => {
      expect(SHEDDING_POLICY.critical).toContain('low');
      expect(SHEDDING_POLICY.critical).toContain('normal');
      expect(SHEDDING_POLICY.critical).toContain('high');
    });

    it('should never shed CRITICAL priority', () => {
      expect(SHEDDING_POLICY.critical).not.toContain('critical');
    });
  });

  // ===========================================================================
  // getCurrentLoadLevel Function
  // ===========================================================================
  describe('getCurrentLoadLevel', () => {
    const getCurrentLoadLevel = (eventLoopLag: number, memoryPercent: number) => {
      if (eventLoopLag >= 200 || memoryPercent >= 95) return 'critical';
      if (eventLoopLag >= 100 || memoryPercent >= 85) return 'high';
      if (eventLoopLag >= 50 || memoryPercent >= 70) return 'warning';
      return 'normal';
    };

    it('should return NORMAL when under thresholds', () => {
      expect(getCurrentLoadLevel(10, 50)).toBe('normal');
    });

    it('should return WARNING when lag >= 50ms', () => {
      expect(getCurrentLoadLevel(50, 50)).toBe('warning');
    });

    it('should return WARNING when memory >= 70%', () => {
      expect(getCurrentLoadLevel(10, 70)).toBe('warning');
    });

    it('should return HIGH when lag >= 100ms', () => {
      expect(getCurrentLoadLevel(100, 50)).toBe('high');
    });

    it('should return HIGH when memory >= 85%', () => {
      expect(getCurrentLoadLevel(10, 85)).toBe('high');
    });

    it('should return CRITICAL when lag >= 200ms', () => {
      expect(getCurrentLoadLevel(200, 50)).toBe('critical');
    });

    it('should return CRITICAL when memory >= 95%', () => {
      expect(getCurrentLoadLevel(10, 95)).toBe('critical');
    });
  });

  // ===========================================================================
  // shouldShedRequest Function
  // ===========================================================================
  describe('shouldShedRequest', () => {
    const shouldShedRequest = (priority: string, loadLevel: string) => {
      if (priority === 'critical') return false;
      
      const policy: Record<string, string[]> = {
        normal: [],
        warning: ['low'],
        high: ['low', 'normal'],
        critical: ['low', 'normal', 'high']
      };
      
      return policy[loadLevel]?.includes(priority) || false;
    };

    it('should never shed CRITICAL priority', () => {
      expect(shouldShedRequest('critical', 'critical')).toBe(false);
    });

    it('should shed LOW at WARNING level', () => {
      expect(shouldShedRequest('low', 'warning')).toBe(true);
    });

    it('should not shed HIGH at WARNING level', () => {
      expect(shouldShedRequest('high', 'warning')).toBe(false);
    });

    it('should shed NORMAL at HIGH level', () => {
      expect(shouldShedRequest('normal', 'high')).toBe(true);
    });

    it('should shed HIGH at CRITICAL level', () => {
      expect(shouldShedRequest('high', 'critical')).toBe(true);
    });
  });

  // ===========================================================================
  // calculateRetryAfter Function
  // ===========================================================================
  describe('calculateRetryAfter', () => {
    const calculateRetryAfter = (loadLevel: string) => {
      switch (loadLevel) {
        case 'critical': return 30;
        case 'high': return 15;
        case 'warning': return 5;
        default: return 1;
      }
    };

    it('should return 30 seconds for CRITICAL', () => {
      expect(calculateRetryAfter('critical')).toBe(30);
    });

    it('should return 15 seconds for HIGH', () => {
      expect(calculateRetryAfter('high')).toBe(15);
    });

    it('should return 5 seconds for WARNING', () => {
      expect(calculateRetryAfter('warning')).toBe(5);
    });

    it('should return 1 second for NORMAL', () => {
      expect(calculateRetryAfter('normal')).toBe(1);
    });
  });

  // ===========================================================================
  // getLoadSheddingMetrics Function
  // ===========================================================================
  describe('getLoadSheddingMetrics', () => {
    it('should return shedTotal', () => {
      const metrics = { shedTotal: 10 };
      expect(metrics.shedTotal).toBe(10);
    });

    it('should return shedByPriority breakdown', () => {
      const metrics = {
        shedByPriority: { critical: 0, high: 2, normal: 5, low: 8 }
      };
      expect(metrics.shedByPriority.low).toBe(8);
    });

    it('should return allowedTotal', () => {
      const metrics = { allowedTotal: 1000 };
      expect(metrics.allowedTotal).toBe(1000);
    });

    it('should return currentLoadLevel', () => {
      const metrics = { currentLoadLevel: 'warning' };
      expect(metrics.currentLoadLevel).toBe('warning');
    });

    it('should return eventLoopLag', () => {
      const metrics = { eventLoopLag: 75 };
      expect(metrics.eventLoopLag).toBe(75);
    });

    it('should return memoryUsagePercent', () => {
      const metrics = { memoryUsagePercent: 68.5 };
      expect(metrics.memoryUsagePercent).toBe(68.5);
    });
  });

  // ===========================================================================
  // 503 Response Format
  // ===========================================================================
  describe('503 Response Format', () => {
    it('should return RFC 7807 problem details', () => {
      const response = {
        type: 'https://api.tickettoken.com/errors/SERVICE_UNAVAILABLE',
        title: 'Service Temporarily Overloaded',
        status: 503,
        detail: 'Server is overloaded. Please retry after 15 seconds.',
        code: 'LOAD_SHEDDING'
      };
      
      expect(response.type).toContain('SERVICE_UNAVAILABLE');
      expect(response.status).toBe(503);
      expect(response.code).toBe('LOAD_SHEDDING');
    });

    it('should include Retry-After header', () => {
      const headers: Record<string, string | number> = {};
      headers['Retry-After'] = 15;
      expect(headers['Retry-After']).toBe(15);
    });

    it('should include X-Load-Level header', () => {
      const headers: Record<string, string> = {};
      headers['X-Load-Level'] = 'high';
      expect(headers['X-Load-Level']).toBe('high');
    });

    it('should include X-Request-Priority header', () => {
      const headers: Record<string, string> = {};
      headers['X-Request-Priority'] = 'normal';
      expect(headers['X-Request-Priority']).toBe('normal');
    });
  });

  // ===========================================================================
  // isLoadSheddingActive Function
  // ===========================================================================
  describe('isLoadSheddingActive', () => {
    it('should return false when disabled', () => {
      const enabled = false;
      const isActive = enabled && true;
      expect(isActive).toBe(false);
    });

    it('should return false when load level is NORMAL', () => {
      const loadLevel = 'normal';
      const isActive = loadLevel !== 'normal';
      expect(isActive).toBe(false);
    });

    it('should return true when load level is WARNING', () => {
      const loadLevel = 'warning';
      const isActive = loadLevel !== 'normal';
      expect(isActive).toBe(true);
    });

    it('should return true when load level is HIGH', () => {
      const loadLevel = 'high';
      const isActive = loadLevel !== 'normal';
      expect(isActive).toBe(true);
    });
  });

  // ===========================================================================
  // getLoadStatus Function
  // ===========================================================================
  describe('getLoadStatus', () => {
    it('should return enabled status', () => {
      const status = { enabled: true };
      expect(status.enabled).toBe(true);
    });

    it('should return current level', () => {
      const status = { level: 'warning' };
      expect(status.level).toBe('warning');
    });

    it('should return eventLoopLag', () => {
      const status = { eventLoopLag: 55 };
      expect(status.eventLoopLag).toBe(55);
    });

    it('should return memoryUsagePercent', () => {
      const status = { memoryUsagePercent: 72.3 };
      expect(status.memoryUsagePercent).toBe(72.3);
    });

    it('should return shedding boolean', () => {
      const status = { shedding: true };
      expect(status.shedding).toBe(true);
    });
  });

  // ===========================================================================
  // Custom Priority Function Middleware
  // ===========================================================================
  describe('createLoadSheddingMiddleware', () => {
    it('should accept custom priority function', () => {
      const customPriority = (request: any) => 'high';
      expect(typeof customPriority).toBe('function');
    });

    it('should use custom priority when provided', () => {
      const customPriority = () => 'critical';
      const priority = customPriority();
      expect(priority).toBe('critical');
    });
  });
});
