import { WaitingRoomService } from '../services/high-demand/waiting-room.service';
import jwt from 'jsonwebtoken';

describe('Phase 2.2: Waiting Room Token Security', () => {
  let waitingRoom: WaitingRoomService;
  
  beforeEach(() => {
    waitingRoom = new WaitingRoomService();
  });

  describe('Token Generation', () => {
    it('should generate cryptographically signed tokens', async () => {
      const token = await waitingRoom['generateAccessToken']('event123', 'queue456', 'user789');
      
      // Token should be a JWT (three base64 parts separated by dots)
      expect(token.split('.').length).toBe(3);
      
      // Should be able to decode without verification to inspect payload
      const decoded = jwt.decode(token) as any;
      expect(decoded.evt).toBe('event123');
      expect(decoded.qid).toBe('queue456');
      expect(decoded.sub).toBe('user789');
      expect(decoded.scope).toBe('queue');
    });
  });

  describe('Token Validation', () => {
    it('should reject tampered tokens', async () => {
      // Generate a valid token
      const validToken = await waitingRoom['generateAccessToken']('event123', 'queue456', 'user789');
      
      // Tamper with the token (change last character)
      const tamperedToken = validToken.slice(0, -1) + 'X';
      
      // Validation should fail
      const result = await waitingRoom.validateAccessToken(tamperedToken);
      expect(result.valid).toBe(false);
    });

    it('should reject tokens with wrong signature', async () => {
      // Create a token with different secret
      const wrongToken = jwt.sign(
        { evt: 'event123', qid: 'queue456', scope: 'queue' },
        'wrong-secret',
        { algorithm: 'HS256', issuer: 'waiting-room' }
      );
      
      const result = await waitingRoom.validateAccessToken(wrongToken);
      expect(result.valid).toBe(false);
    });

    it('should reject expired tokens', async () => {
      // Create an already-expired token
      const expiredToken = jwt.sign(
        { 
          evt: 'event123', 
          qid: 'queue456', 
          scope: 'queue',
          exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
        },
        process.env.QUEUE_TOKEN_SECRET || 'dev-secret-change-in-production',
        { algorithm: 'HS256', issuer: 'waiting-room' }
      );
      
      const result = await waitingRoom.validateAccessToken(expiredToken);
      expect(result.valid).toBe(false);
    });

    it('prevents the old vulnerability - predictable tokens dont work', async () => {
      // Try the old vulnerable token format
      const oldVulnerableToken = `access_event123_queue456_${Date.now()}`;
      
      const result = await waitingRoom.validateAccessToken(oldVulnerableToken);
      expect(result.valid).toBe(false);
    });
  });
});
