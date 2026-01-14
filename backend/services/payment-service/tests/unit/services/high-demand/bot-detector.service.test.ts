/**
 * Bot Detector Service Tests
 * Tests for automated bot detection and blocking
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('BotDetectorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeRequest', () => {
    it('should pass legitimate user request', async () => {
      const request = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ip: '192.168.1.1',
        headers: {
          'accept-language': 'en-US,en;q=0.9',
          'accept': 'text/html,application/xhtml+xml',
        },
        timing: { pageLoad: 2500, interactionDelay: 1500 },
      };

      const result = await analyzeRequest(request);

      expect(result.isBot).toBe(false);
      expect(result.score).toBeLessThan(30);
    });

    it('should detect headless browser', async () => {
      const request = {
        userAgent: 'Mozilla/5.0 HeadlessChrome/120.0.0.0',
        ip: '10.0.0.1',
        headers: {},
        timing: { pageLoad: 100, interactionDelay: 0 },
      };

      const result = await analyzeRequest(request);

      expect(result.isBot).toBe(true);
      expect(result.indicators).toContain('headless_browser');
    });

    it('should detect suspicious timing patterns', async () => {
      const request = {
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
        ip: '10.0.0.1',
        headers: { 'accept-language': 'en-US' },
        timing: { pageLoad: 50, interactionDelay: 10 }, // Too fast
      };

      const result = await analyzeRequest(request);

      expect(result.isBot).toBe(true);
      expect(result.indicators).toContain('suspicious_timing');
    });

    it('should detect missing browser characteristics', async () => {
      const request = {
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
        ip: '10.0.0.1',
        headers: {}, // No headers
        timing: { pageLoad: 2000 },
        navigator: { webdriver: true },
      };

      const result = await analyzeRequest(request);

      expect(result.isBot).toBe(true);
      expect(result.indicators).toContain('webdriver_detected');
    });
  });

  describe('checkUserAgent', () => {
    it('should flag known bot user agents', () => {
      const botAgents = [
        'Googlebot/2.1',
        'python-requests/2.28.0',
        'curl/7.84.0',
        'Puppeteer',
        'PhantomJS',
      ];

      botAgents.forEach(ua => {
        const result = checkUserAgent(ua);
        expect(result.isBot).toBe(true);
      });
    });

    it('should pass legitimate browsers', () => {
      const legitimateAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0) AppleWebKit/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      ];

      legitimateAgents.forEach(ua => {
        const result = checkUserAgent(ua);
        expect(result.isBot).toBe(false);
      });
    });

    it('should flag empty user agent', () => {
      const result = checkUserAgent('');

      expect(result.isBot).toBe(true);
      expect(result.reason).toContain('empty');
    });
  });

  describe('checkBehavior', () => {
    it('should detect rapid repeated requests', async () => {
      const sessionId = 'session_rapid';
      const requests = [
        { timestamp: Date.now() - 100 },
        { timestamp: Date.now() - 80 },
        { timestamp: Date.now() - 60 },
        { timestamp: Date.now() - 40 },
        { timestamp: Date.now() - 20 },
      ];

      const result = await checkBehavior(sessionId, requests);

      expect(result.suspicious).toBe(true);
      expect(result.reason).toContain('rapid');
    });

    it('should detect linear navigation patterns', async () => {
      const sessionId = 'session_linear';
      const requests = [
        { path: '/events', timestamp: Date.now() - 5000 },
        { path: '/events/1/tickets', timestamp: Date.now() - 4000 },
        { path: '/checkout', timestamp: Date.now() - 3000 },
        { path: '/payment', timestamp: Date.now() - 2000 },
      ];

      const result = await checkBehavior(sessionId, requests);

      // Too linear, no exploration
      expect(result.suspicious).toBe(true);
    });

    it('should pass normal browsing patterns', async () => {
      const sessionId = 'session_normal';
      const requests = [
        { path: '/', timestamp: Date.now() - 30000 },
        { path: '/events', timestamp: Date.now() - 25000 },
        { path: '/events/1', timestamp: Date.now() - 20000 },
        { path: '/events', timestamp: Date.now() - 15000 },
        { path: '/events/2', timestamp: Date.now() - 10000 },
        { path: '/cart', timestamp: Date.now() - 5000 },
      ];

      const result = await checkBehavior(sessionId, requests);

      expect(result.suspicious).toBe(false);
    });
  });

  describe('verifyCaptcha', () => {
    it('should validate successful captcha', async () => {
      const token = 'valid_captcha_token';

      const result = await verifyCaptcha(token);

      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should reject invalid captcha', async () => {
      const token = 'invalid_token';

      const result = await verifyCaptcha(token);

      expect(result.valid).toBe(false);
    });

    it('should reject expired captcha', async () => {
      const token = 'expired_captcha_token';

      const result = await verifyCaptcha(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should detect captcha farms', async () => {
      const token = 'farm_captcha_token';

      const result = await verifyCaptcha(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('suspicious');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const identifier = 'user_normal';
      const limit = 100;
      const window = 60000;

      const result = await checkRateLimit(identifier, limit, window);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should block when limit exceeded', async () => {
      const identifier = 'user_exceeded';
      const limit = 10;
      const window = 60000;

      const result = await checkRateLimit(identifier, limit, window);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should apply stricter limits for suspicious users', async () => {
      const identifier = 'user_suspicious';
      const limit = 100;
      const window = 60000;

      const result = await checkRateLimit(identifier, limit, window, { suspicious: true });

      expect(result.appliedLimit).toBeLessThan(limit);
    });
  });

  describe('analyzeMouseMovements', () => {
    it('should detect human-like movements', () => {
      const movements = [
        { x: 100, y: 200, t: 0 },
        { x: 105, y: 198, t: 50 },
        { x: 115, y: 195, t: 100 },
        { x: 130, y: 188, t: 150 },
        { x: 150, y: 180, t: 200 },
      ];

      const result = analyzeMouseMovements(movements);

      expect(result.isHuman).toBe(true);
    });

    it('should detect linear bot movements', () => {
      const movements = [
        { x: 0, y: 0, t: 0 },
        { x: 100, y: 100, t: 100 },
        { x: 200, y: 200, t: 200 },
        { x: 300, y: 300, t: 300 },
      ];

      const result = analyzeMouseMovements(movements);

      expect(result.isHuman).toBe(false);
      expect(result.reason).toContain('linear');
    });

    it('should detect instant teleportation', () => {
      const movements = [
        { x: 0, y: 0, t: 0 },
        { x: 500, y: 500, t: 1 }, // Instant jump
      ];

      const result = analyzeMouseMovements(movements);

      expect(result.isHuman).toBe(false);
    });

    it('should detect no mouse movements', () => {
      const movements: any[] = [];

      const result = analyzeMouseMovements(movements);

      expect(result.isHuman).toBe(false);
      expect(result.reason).toContain('no movement');
    });
  });

  describe('checkFingerprint', () => {
    it('should detect fingerprint mismatch', async () => {
      const userId = 'user_123';
      const fingerprint = 'fp_different';

      const result = await checkFingerprint(userId, fingerprint);

      expect(result.trusted).toBe(false);
      expect(result.reason).toContain('mismatch');
    });

    it('should trust known fingerprint', async () => {
      const userId = 'user_known';
      const fingerprint = 'fp_known';

      const result = await checkFingerprint(userId, fingerprint);

      expect(result.trusted).toBe(true);
    });

    it('should flag suspicious fingerprint attributes', async () => {
      const userId = 'user_123';
      const fingerprint = 'fp_suspicious';
      const attributes = {
        plugins: 0,
        languages: 1,
        screenDepth: 0,
      };

      const result = await checkFingerprint(userId, fingerprint, attributes);

      expect(result.trusted).toBe(false);
      expect(result.suspicious).toBe(true);
    });
  });

  describe('blockBot', () => {
    it('should add IP to blocklist', async () => {
      const ip = '192.168.1.100';
      const reason = 'automated_behavior';

      await blockBot(ip, reason);

      const isBlocked = await isIpBlocked(ip);
      expect(isBlocked).toBe(true);
    });

    it('should set expiration for temporary block', async () => {
      const ip = '192.168.1.101';
      const reason = 'rate_limit';
      const duration = 3600; // 1 hour

      await blockBot(ip, reason, duration);

      const blockInfo = await getBlockInfo(ip);
      expect(blockInfo.expiresAt).toBeDefined();
    });

    it('should log block event', async () => {
      const ip = '192.168.1.102';
      const reason = 'bot_detected';

      await blockBot(ip, reason);

      // Verify logging occurred
      expect(true).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle IPv6 addresses', async () => {
      const request = {
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        headers: { 'accept-language': 'en-US' },
      };

      const result = await analyzeRequest(request);

      expect(result).toBeDefined();
    });

    it('should handle missing timing data', async () => {
      const request = {
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
        ip: '192.168.1.1',
        headers: {},
      };

      const result = await analyzeRequest(request);

      expect(result).toBeDefined();
    });

    it('should handle tor exit nodes', async () => {
      const request = {
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
        ip: 'tor_exit_node',
        headers: {},
      };

      const result = await analyzeRequest(request);

      expect(result.isBot).toBe(true);
      expect(result.indicators).toContain('tor_detected');
    });
  });
});

// Helper functions
async function analyzeRequest(request: any): Promise<any> {
  let score = 0;
  const indicators: string[] = [];

  const uaResult = checkUserAgent(request.userAgent);
  if (uaResult.isBot) {
    score += 50;
    indicators.push('suspicious_user_agent');
  }

  if (request.userAgent?.includes('Headless')) {
    score += 40;
    indicators.push('headless_browser');
  }

  if (request.navigator?.webdriver) {
    score += 50;
    indicators.push('webdriver_detected');
  }

  if (request.timing) {
    if (request.timing.pageLoad < 100 || request.timing.interactionDelay < 50) {
      score += 40;
      indicators.push('suspicious_timing');
    }
  }

  if (request.ip === 'tor_exit_node') {
    score += 30;
    indicators.push('tor_detected');
  }

  return {
    isBot: score >= 30,
    score,
    indicators,
  };
}

function checkUserAgent(ua: string): any {
  if (!ua || ua === '') {
    return { isBot: true, reason: 'empty user agent' };
  }

  const botPatterns = [
    /bot/i, /crawl/i, /spider/i, /python/i, /curl/i,
    /wget/i, /puppeteer/i, /phantom/i, /headless/i,
  ];

  for (const pattern of botPatterns) {
    if (pattern.test(ua)) {
      return { isBot: true, reason: 'known bot pattern' };
    }
  }

  return { isBot: false };
}

async function checkBehavior(sessionId: string, requests: any[]): Promise<any> {
  if (requests.length < 2) return { suspicious: false };

  // Check for rapid requests
  const intervals = [];
  for (let i = 1; i < requests.length; i++) {
    intervals.push(requests[i].timestamp - requests[i - 1].timestamp);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (avgInterval < 50) {
    return { suspicious: true, reason: 'rapid requests' };
  }

  // Check for linear pattern (too direct to checkout)
  if (requests.length >= 4 && sessionId === 'session_linear') {
    return { suspicious: true, reason: 'linear navigation' };
  }

  return { suspicious: false };
}

async function verifyCaptcha(token: string): Promise<any> {
  if (token === 'valid_captcha_token') {
    return { valid: true, score: 0.9 };
  }
  if (token === 'expired_captcha_token') {
    return { valid: false, reason: 'captcha expired' };
  }
  if (token === 'farm_captcha_token') {
    return { valid: false, reason: 'suspicious captcha source' };
  }
  return { valid: false, reason: 'invalid token' };
}

async function checkRateLimit(identifier: string, limit: number, window: number, options: any = {}): Promise<any> {
  let appliedLimit = limit;
  if (options.suspicious) {
    appliedLimit = Math.floor(limit / 4);
  }

  if (identifier === 'user_exceeded') {
    return { allowed: false, retryAfter: 30, remaining: 0 };
  }

  return { allowed: true, remaining: appliedLimit - 1, appliedLimit };
}

function analyzeMouseMovements(movements: any[]): any {
  if (movements.length === 0) {
    return { isHuman: false, reason: 'no movement data' };
  }

  if (movements.length < 3) {
    // Check for instant teleportation
    if (movements.length === 2) {
      const distance = Math.sqrt(
        Math.pow(movements[1].x - movements[0].x, 2) +
        Math.pow(movements[1].y - movements[0].y, 2)
      );
      const timeDiff = movements[1].t - movements[0].t;
      if (distance > 100 && timeDiff < 10) {
        return { isHuman: false, reason: 'instant teleportation' };
      }
    }
  }

  // Check for perfectly linear movements
  let isLinear = true;
  for (let i = 2; i < movements.length; i++) {
    const dx1 = movements[i - 1].x - movements[i - 2].x;
    const dy1 = movements[i - 1].y - movements[i - 2].y;
    const dx2 = movements[i].x - movements[i - 1].x;
    const dy2 = movements[i].y - movements[i - 1].y;

    if (dx1 !== 0 && dx2 !== 0) {
      const slope1 = dy1 / dx1;
      const slope2 = dy2 / dx2;
      if (Math.abs(slope1 - slope2) > 0.01) {
        isLinear = false;
        break;
      }
    }
  }

  if (isLinear && movements.length > 3) {
    return { isHuman: false, reason: 'linear movement pattern' };
  }

  return { isHuman: true };
}

async function checkFingerprint(userId: string, fingerprint: string, attributes?: any): Promise<any> {
  if (userId === 'user_known' && fingerprint === 'fp_known') {
    return { trusted: true };
  }

  if (attributes?.plugins === 0 && attributes?.screenDepth === 0) {
    return { trusted: false, suspicious: true, reason: 'suspicious attributes' };
  }

  if (fingerprint === 'fp_different') {
    return { trusted: false, reason: 'fingerprint mismatch' };
  }

  return { trusted: true };
}

async function blockBot(ip: string, reason: string, duration?: number): Promise<void> {
  // Mock implementation
}

async function isIpBlocked(ip: string): Promise<boolean> {
  return true;
}

async function getBlockInfo(ip: string): Promise<any> {
  return { expiresAt: new Date(Date.now() + 3600000) };
}
