import { oauthConfig, oauthProviders } from '../../../src/config/oauth';

describe('oauth config', () => {
  describe('oauthConfig', () => {
    it('should have google config', () => {
      expect(oauthConfig.google).toBeDefined();
      expect(oauthConfig.google).toHaveProperty('clientId');
      expect(oauthConfig.google).toHaveProperty('clientSecret');
      expect(oauthConfig.google).toHaveProperty('redirectUri');
    });

    it('should have github config', () => {
      expect(oauthConfig.github).toBeDefined();
      expect(oauthConfig.github).toHaveProperty('clientId');
      expect(oauthConfig.github).toHaveProperty('clientSecret');
      expect(oauthConfig.github).toHaveProperty('redirectUri');
    });

    it('should have facebook config', () => {
      expect(oauthConfig.facebook).toBeDefined();
      expect(oauthConfig.facebook).toHaveProperty('clientId');
      expect(oauthConfig.facebook).toHaveProperty('clientSecret');
      expect(oauthConfig.facebook).toHaveProperty('redirectUri');
    });

    it('should have default redirect URIs', () => {
      expect(oauthConfig.google.redirectUri).toContain('/oauth/google/callback');
      expect(oauthConfig.github.redirectUri).toContain('/oauth/github/callback');
      expect(oauthConfig.facebook.redirectUri).toContain('/facebook/callback');
    });
  });

  describe('oauthProviders', () => {
    it('should list all providers', () => {
      expect(oauthProviders).toContain('google');
      expect(oauthProviders).toContain('github');
      expect(oauthProviders).toContain('facebook');
      expect(oauthProviders).toHaveLength(3);
    });
  });
});
