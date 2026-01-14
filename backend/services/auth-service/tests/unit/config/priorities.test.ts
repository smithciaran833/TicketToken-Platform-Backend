import {
  Priority,
  getRoutePriority,
  shouldShedRoute,
  getPriorityName,
} from '../../../src/config/priorities';

describe('priorities config', () => {
  describe('Priority enum', () => {
    it('has correct values', () => {
      expect(Priority.CRITICAL).toBe(4);
      expect(Priority.HIGH).toBe(3);
      expect(Priority.NORMAL).toBe(2);
      expect(Priority.LOW).toBe(1);
    });
  });

  describe('getRoutePriority', () => {
    describe('exact matches', () => {
      it('returns CRITICAL for login', () => {
        expect(getRoutePriority('POST', '/auth/login')).toBe(Priority.CRITICAL);
      });

      it('returns CRITICAL for refresh', () => {
        expect(getRoutePriority('POST', '/auth/refresh')).toBe(Priority.CRITICAL);
      });

      it('returns CRITICAL for verify-mfa', () => {
        expect(getRoutePriority('POST', '/auth/verify-mfa')).toBe(Priority.CRITICAL);
      });

      it('returns CRITICAL for health endpoints', () => {
        expect(getRoutePriority('GET', '/health/live')).toBe(Priority.CRITICAL);
        expect(getRoutePriority('GET', '/health/ready')).toBe(Priority.CRITICAL);
      });

      it('returns HIGH for register', () => {
        expect(getRoutePriority('POST', '/auth/register')).toBe(Priority.HIGH);
      });

      it('returns HIGH for password reset', () => {
        expect(getRoutePriority('POST', '/auth/forgot-password')).toBe(Priority.HIGH);
        expect(getRoutePriority('POST', '/auth/reset-password')).toBe(Priority.HIGH);
      });

      it('returns HIGH for logout', () => {
        expect(getRoutePriority('POST', '/auth/logout')).toBe(Priority.HIGH);
      });

      it('returns NORMAL for profile operations', () => {
        expect(getRoutePriority('GET', '/auth/me')).toBe(Priority.NORMAL);
        expect(getRoutePriority('PUT', '/auth/profile')).toBe(Priority.NORMAL);
      });

      it('returns NORMAL for sessions', () => {
        expect(getRoutePriority('GET', '/auth/sessions')).toBe(Priority.NORMAL);
      });

      it('returns LOW for export', () => {
        expect(getRoutePriority('GET', '/auth/export')).toBe(Priority.LOW);
      });

      it('returns LOW for metrics', () => {
        expect(getRoutePriority('GET', '/metrics')).toBe(Priority.LOW);
      });

      it('returns LOW for docs', () => {
        expect(getRoutePriority('GET', '/docs')).toBe(Priority.LOW);
      });
    });

    describe('wildcard matches', () => {
      it('returns HIGH for internal routes', () => {
        expect(getRoutePriority('GET', '/auth/internal/health')).toBe(Priority.HIGH);
        expect(getRoutePriority('GET', '/auth/internal/validate')).toBe(Priority.HIGH);
        expect(getRoutePriority('POST', '/auth/internal/verify-token')).toBe(Priority.HIGH);
      });

      it('returns NORMAL for session delete with ID', () => {
        expect(getRoutePriority('DELETE', '/auth/sessions/123')).toBe(Priority.NORMAL);
        expect(getRoutePriority('DELETE', '/auth/sessions/abc-def')).toBe(Priority.NORMAL);
      });

      it('returns LOW for docs subpaths', () => {
        expect(getRoutePriority('GET', '/docs/swagger')).toBe(Priority.LOW);
        expect(getRoutePriority('GET', '/docs/openapi.json')).toBe(Priority.LOW);
      });
    });

    describe('default behavior', () => {
      it('returns NORMAL for unknown routes', () => {
        expect(getRoutePriority('GET', '/unknown/route')).toBe(Priority.NORMAL);
        expect(getRoutePriority('POST', '/something/else')).toBe(Priority.NORMAL);
      });

      it('returns NORMAL for unmatched methods', () => {
        expect(getRoutePriority('DELETE', '/auth/login')).toBe(Priority.NORMAL);
        expect(getRoutePriority('PUT', '/auth/register')).toBe(Priority.NORMAL);
      });
    });
  });

  describe('shouldShedRoute', () => {
    describe('CRITICAL routes', () => {
      it('never sheds CRITICAL even at 99% load', () => {
        expect(shouldShedRoute(Priority.CRITICAL, 99)).toBe(false);
        expect(shouldShedRoute(Priority.CRITICAL, 100)).toBe(false);
      });

      it('never sheds CRITICAL at any load level', () => {
        expect(shouldShedRoute(Priority.CRITICAL, 0)).toBe(false);
        expect(shouldShedRoute(Priority.CRITICAL, 50)).toBe(false);
        expect(shouldShedRoute(Priority.CRITICAL, 70)).toBe(false);
        expect(shouldShedRoute(Priority.CRITICAL, 85)).toBe(false);
        expect(shouldShedRoute(Priority.CRITICAL, 95)).toBe(false);
      });
    });

    describe('HIGH routes', () => {
      it('does not shed at load < 85', () => {
        expect(shouldShedRoute(Priority.HIGH, 0)).toBe(false);
        expect(shouldShedRoute(Priority.HIGH, 50)).toBe(false);
        expect(shouldShedRoute(Priority.HIGH, 70)).toBe(false);
        expect(shouldShedRoute(Priority.HIGH, 84)).toBe(false);
      });

      it('sheds at load >= 85', () => {
        expect(shouldShedRoute(Priority.HIGH, 85)).toBe(true);
        expect(shouldShedRoute(Priority.HIGH, 90)).toBe(true);
        expect(shouldShedRoute(Priority.HIGH, 95)).toBe(true);
      });
    });

    describe('NORMAL routes', () => {
      it('does not shed at load < 70', () => {
        expect(shouldShedRoute(Priority.NORMAL, 0)).toBe(false);
        expect(shouldShedRoute(Priority.NORMAL, 50)).toBe(false);
        expect(shouldShedRoute(Priority.NORMAL, 69)).toBe(false);
      });

      it('sheds at load >= 70', () => {
        expect(shouldShedRoute(Priority.NORMAL, 70)).toBe(true);
        expect(shouldShedRoute(Priority.NORMAL, 80)).toBe(true);
        expect(shouldShedRoute(Priority.NORMAL, 95)).toBe(true);
      });
    });

    describe('LOW routes', () => {
      it('does not shed at load < 50', () => {
        expect(shouldShedRoute(Priority.LOW, 0)).toBe(false);
        expect(shouldShedRoute(Priority.LOW, 25)).toBe(false);
        expect(shouldShedRoute(Priority.LOW, 49)).toBe(false);
      });

      it('sheds at load >= 50', () => {
        expect(shouldShedRoute(Priority.LOW, 50)).toBe(true);
        expect(shouldShedRoute(Priority.LOW, 60)).toBe(true);
        expect(shouldShedRoute(Priority.LOW, 95)).toBe(true);
      });
    });

    describe('boundary conditions', () => {
      it('handles 0% load', () => {
        expect(shouldShedRoute(Priority.LOW, 0)).toBe(false);
        expect(shouldShedRoute(Priority.NORMAL, 0)).toBe(false);
        expect(shouldShedRoute(Priority.HIGH, 0)).toBe(false);
        expect(shouldShedRoute(Priority.CRITICAL, 0)).toBe(false);
      });

      it('handles 100% load', () => {
        expect(shouldShedRoute(Priority.LOW, 100)).toBe(true);
        expect(shouldShedRoute(Priority.NORMAL, 100)).toBe(true);
        expect(shouldShedRoute(Priority.HIGH, 100)).toBe(true);
        expect(shouldShedRoute(Priority.CRITICAL, 100)).toBe(false);
      });
    });
  });

  describe('getPriorityName', () => {
    it('returns CRITICAL for Priority.CRITICAL', () => {
      expect(getPriorityName(Priority.CRITICAL)).toBe('CRITICAL');
    });

    it('returns HIGH for Priority.HIGH', () => {
      expect(getPriorityName(Priority.HIGH)).toBe('HIGH');
    });

    it('returns NORMAL for Priority.NORMAL', () => {
      expect(getPriorityName(Priority.NORMAL)).toBe('NORMAL');
    });

    it('returns LOW for Priority.LOW', () => {
      expect(getPriorityName(Priority.LOW)).toBe('LOW');
    });

    it('returns UNKNOWN for invalid priority', () => {
      expect(getPriorityName(99 as Priority)).toBe('UNKNOWN');
      expect(getPriorityName(-1 as Priority)).toBe('UNKNOWN');
    });
  });
});
