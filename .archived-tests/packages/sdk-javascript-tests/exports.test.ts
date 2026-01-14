import * as SDK from '../src/index';

describe('JavaScript SDK Exports', () => {
  it('should export TicketToken class', () => {
    expect(SDK.TicketToken).toBeDefined();
    expect(typeof SDK.TicketToken).toBe('function');
  });

  it('should export error classes', () => {
    expect(SDK.TicketTokenError).toBeDefined();
    expect(SDK.APIError).toBeDefined();
    expect(SDK.AuthenticationError).toBeDefined();
    expect(SDK.ValidationError).toBeDefined();
    expect(SDK.RateLimitError).toBeDefined();
    expect(SDK.NetworkError).toBeDefined();
    expect(SDK.ConfigurationError).toBeDefined();
  });

  it('should export default', () => {
    const DefaultExport = require('../src/index').default;
    expect(DefaultExport).toBeDefined();
    expect(DefaultExport).toBe(SDK.TicketToken);
  });

  it('should be able to instantiate TicketToken', () => {
    const client = new SDK.TicketToken({ apiKey: 'test-key' });
    expect(client).toBeInstanceOf(SDK.TicketToken);
    expect(client.events).toBeDefined();
    expect(client.tickets).toBeDefined();
    expect(client.users).toBeDefined();
  });
});
