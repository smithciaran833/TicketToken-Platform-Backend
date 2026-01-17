import { addDeprecationHeaders, deprecationMiddleware, DEPRECATED_ENDPOINTS } from '../../../src/utils/deprecation';

describe('deprecation.ts', () => {
  describe('addDeprecationHeaders', () => {
    let mockReply: any;

    beforeEach(() => {
      mockReply = {
        header: jest.fn().mockReturnThis(),
      };
    });

    it('adds Deprecation header as "true" when no deprecation date provided', () => {
      const config = {
        sunsetDate: new Date('2025-06-01'),
      };

      addDeprecationHeaders(mockReply, config);

      expect(mockReply.header).toHaveBeenCalledWith('Deprecation', 'true');
    });

    it('adds Deprecation header with date when deprecation date provided', () => {
      const deprecationDate = new Date('2025-01-01T00:00:00Z');
      const config = {
        deprecationDate,
        sunsetDate: new Date('2025-06-01'),
      };

      addDeprecationHeaders(mockReply, config);

      expect(mockReply.header).toHaveBeenCalledWith('Deprecation', deprecationDate.toUTCString());
    });

    it('adds Sunset header with date', () => {
      const sunsetDate = new Date('2025-06-01T00:00:00Z');
      const config = {
        sunsetDate,
      };

      addDeprecationHeaders(mockReply, config);

      expect(mockReply.header).toHaveBeenCalledWith('Sunset', sunsetDate.toUTCString());
    });

    it('adds Link header with migration guide', () => {
      const config = {
        sunsetDate: new Date('2025-06-01'),
        migrationGuide: 'https://docs.example.com/migration',
      };

      addDeprecationHeaders(mockReply, config);

      expect(mockReply.header).toHaveBeenCalledWith(
        'Link',
        '<https://docs.example.com/migration>; rel="deprecation"'
      );
    });

    it('adds Link header with alternative endpoint', () => {
      const config = {
        sunsetDate: new Date('2025-06-01'),
        alternativeEndpoint: '/api/v2/endpoint',
      };

      addDeprecationHeaders(mockReply, config);

      expect(mockReply.header).toHaveBeenCalledWith(
        'Link',
        '</api/v2/endpoint>; rel="successor-version"'
      );
    });

    it('adds Link header with both migration guide and alternative endpoint', () => {
      const config = {
        sunsetDate: new Date('2025-06-01'),
        migrationGuide: 'https://docs.example.com/migration',
        alternativeEndpoint: '/api/v2/endpoint',
      };

      addDeprecationHeaders(mockReply, config);

      expect(mockReply.header).toHaveBeenCalledWith(
        'Link',
        '<https://docs.example.com/migration>; rel="deprecation", </api/v2/endpoint>; rel="successor-version"'
      );
    });

    it('does not add Link header when no links provided', () => {
      const config = {
        sunsetDate: new Date('2025-06-01'),
      };

      addDeprecationHeaders(mockReply, config);

      const linkCalls = mockReply.header.mock.calls.filter((call: any) => call[0] === 'Link');
      expect(linkCalls.length).toBe(0);
    });
  });

  describe('deprecationMiddleware', () => {
    let mockRequest: any;
    let mockReply: any;

    beforeEach(() => {
      mockRequest = {
        url: '/api/test',
      };
      mockReply = {
        header: jest.fn().mockReturnThis(),
      };
    });

    it('adds headers for registered deprecated endpoint', async () => {
      const config = {
        sunsetDate: new Date('2025-06-01'),
        migrationGuide: 'https://docs.example.com/migration',
      };

      DEPRECATED_ENDPOINTS.set('/api/test', config);

      await deprecationMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Deprecation', 'true');
      expect(mockReply.header).toHaveBeenCalledWith('Sunset', config.sunsetDate.toUTCString());

      DEPRECATED_ENDPOINTS.delete('/api/test');
    });

    it('does not add headers for non-deprecated endpoint', async () => {
      await deprecationMiddleware(mockRequest, mockReply);

      expect(mockReply.header).not.toHaveBeenCalled();
    });

    it('strips query parameters from URL when checking', async () => {
      const config = {
        sunsetDate: new Date('2025-06-01'),
      };

      DEPRECATED_ENDPOINTS.set('/api/test', config);
      mockRequest.url = '/api/test?query=param';

      await deprecationMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalled();

      DEPRECATED_ENDPOINTS.delete('/api/test');
    });
  });

  describe('DEPRECATED_ENDPOINTS', () => {
    it('is a Map', () => {
      expect(DEPRECATED_ENDPOINTS).toBeInstanceOf(Map);
    });

    it('is initially empty (no deprecated endpoints yet)', () => {
      expect(DEPRECATED_ENDPOINTS.size).toBe(0);
    });
  });
});
