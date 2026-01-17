// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/autocomplete.service.ts
 */

describe('src/services/autocomplete.service.ts - Comprehensive Unit Tests', () => {
  let AutocompleteService: any;
  let mockElasticsearch: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock Elasticsearch
    mockElasticsearch = {
      search: jest.fn().mockResolvedValue({
        suggest: {
          venue_suggest: [],
          event_suggest: []
        }
      })
    };

    // Mock logger
    mockLogger = {
      error: jest.fn(),
      info: jest.fn()
    };

    AutocompleteService = require('../../../src/services/autocomplete.service').AutocompleteService;
  });

  // =============================================================================
  // Constructor
  // =============================================================================

  describe('Constructor', () => {
    it('should initialize with elasticsearch', () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      expect(service['elasticsearch']).toBe(mockElasticsearch);
    });

    it('should initialize with logger', () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      expect(service['logger']).toBe(mockLogger);
    });
  });

  // =============================================================================
  // getSuggestions() - Input Validation
  // =============================================================================

  describe('getSuggestions() - Input Validation', () => {
    it('should return empty array for empty query', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      const result = await service.getSuggestions('');

      expect(result).toEqual([]);
      expect(mockElasticsearch.search).not.toHaveBeenCalled();
    });

    it('should return empty array for single character', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      const result = await service.getSuggestions('a');

      expect(result).toEqual([]);
    });

    it('should return empty array for null query', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      const result = await service.getSuggestions(null);

      expect(result).toEqual([]);
    });

    it('should return empty array for undefined query', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      const result = await service.getSuggestions(undefined);

      expect(result).toEqual([]);
    });

    it('should accept query of 2+ characters', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('ab');

      expect(mockElasticsearch.search).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getSuggestions() - Elasticsearch Query
  // =============================================================================

  describe('getSuggestions() - Elasticsearch Query', () => {
    it('should query events and venues by default', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('test');

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: ['events', 'venues']
        })
      );
    });

    it('should query only venues when specified', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('test', ['venues']);

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: ['venues']
        })
      );
    });

    it('should query only events when specified', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('test', ['events']);

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: ['events']
        })
      );
    });

    it('should include venue suggest config', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('test', ['venues']);

      const call = mockElasticsearch.search.mock.calls[0][0];
      expect(call.body.suggest.venue_suggest).toBeDefined();
      expect(call.body.suggest.venue_suggest.prefix).toBe('test');
    });

    it('should include event suggest config', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('test', ['events']);

      const call = mockElasticsearch.search.mock.calls[0][0];
      expect(call.body.suggest.event_suggest).toBeDefined();
      expect(call.body.suggest.event_suggest.prefix).toBe('test');
    });

    it('should enable fuzzy matching', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('test');

      const call = mockElasticsearch.search.mock.calls[0][0];
      expect(call.body.suggest.event_suggest.completion.fuzzy).toBeDefined();
      expect(call.body.suggest.event_suggest.completion.fuzzy.fuzziness).toBe('AUTO');
    });

    it('should skip duplicates', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('test');

      const call = mockElasticsearch.search.mock.calls[0][0];
      expect(call.body.suggest.event_suggest.completion.skip_duplicates).toBe(true);
    });

    it('should limit results to 5 per type', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestions('test');

      const call = mockElasticsearch.search.mock.calls[0][0];
      expect(call.body.suggest.event_suggest.completion.size).toBe(5);
    });
  });

  // =============================================================================
  // getSuggestions() - Response Formatting
  // =============================================================================

  describe('getSuggestions() - Response Formatting', () => {
    it('should format venue suggestions', async () => {
      mockElasticsearch.search.mockResolvedValue({
        suggest: {
          venue_suggest: [{
            options: [{
              text: 'Madison Square Garden',
              _score: 10,
              _source: { id: 'venue-1' }
            }]
          }]
        }
      });

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      const result = await service.getSuggestions('madison');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('venue');
      expect(result[0].text).toBe('Madison Square Garden');
    });

    it('should format event suggestions', async () => {
      mockElasticsearch.search.mockResolvedValue({
        suggest: {
          event_suggest: [{
            options: [{
              text: 'Rock Concert',
              _score: 8,
              _source: { id: 'event-1' }
            }]
          }]
        }
      });

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      const result = await service.getSuggestions('rock');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('event');
      expect(result[0].text).toBe('Rock Concert');
    });

    it('should sort by score descending', async () => {
      mockElasticsearch.search.mockResolvedValue({
        suggest: {
          event_suggest: [{
            options: [
              { text: 'Low', _score: 5, _source: {} },
              { text: 'High', _score: 10, _source: {} }
            ]
          }]
        }
      });

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      const result = await service.getSuggestions('test');

      expect(result[0].text).toBe('High');
      expect(result[1].text).toBe('Low');
    });

    it('should remove duplicate texts', async () => {
      mockElasticsearch.search.mockResolvedValue({
        suggest: {
          event_suggest: [{
            options: [
              { text: 'Concert', _score: 8, _source: { id: '1' } },
              { text: 'Concert', _score: 6, _source: { id: '2' } }
            ]
          }]
        }
      });

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      const result = await service.getSuggestions('con');

      expect(result).toHaveLength(1);
      expect(result[0].score).toBe(8); // Keeps higher score
    });

    it('should limit to 10 results', async () => {
      const options = Array.from({ length: 20 }, (_, i) => ({
        text: `Result ${i}`,
        _score: 20 - i,
        _source: {}
      }));

      mockElasticsearch.search.mockResolvedValue({
        suggest: {
          event_suggest: [{ options }]
        }
      });

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      const result = await service.getSuggestions('test');

      expect(result).toHaveLength(10);
    });
  });

  // =============================================================================
  // getSuggestions() - Error Handling
  // =============================================================================

  describe('getSuggestions() - Error Handling', () => {
    it('should return empty array on error', async () => {
      mockElasticsearch.search.mockRejectedValue(new Error('ES error'));

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      const result = await service.getSuggestions('test');

      expect(result).toEqual([]);
    });

    it('should log error', async () => {
      const error = new Error('ES error');
      mockElasticsearch.search.mockRejectedValue(error);

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      await service.getSuggestions('test');

      expect(mockLogger.error).toHaveBeenCalledWith({ error }, 'Autocomplete failed');
    });
  });

  // =============================================================================
  // getSuggestionsWithContext() - Context Handling
  // =============================================================================

  describe('getSuggestionsWithContext() - Context Handling', () => {
    it('should return empty for short query', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      const result = await service.getSuggestionsWithContext('a');

      expect(result).toEqual([]);
    });

    it('should include city context', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestionsWithContext('test', { city: 'New York' });

      const call = mockElasticsearch.search.mock.calls[0][0];
      expect(call.body.suggest.event_suggest.completion.contexts.city).toEqual(['New York']);
    });

    it('should include category context', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestionsWithContext('test', { category: 'music' });

      const call = mockElasticsearch.search.mock.calls[0][0];
      expect(call.body.suggest.event_suggest.completion.contexts.category).toEqual(['music']);
    });

    it('should handle no context', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestionsWithContext('test');

      const call = mockElasticsearch.search.mock.calls[0][0];
      expect(call.body.suggest.event_suggest.completion.contexts).toBeUndefined();
    });

    it('should search events index', async () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      await service.getSuggestionsWithContext('test');

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({ index: 'events' })
      );
    });

    it('should return empty array on error', async () => {
      mockElasticsearch.search.mockRejectedValue(new Error('Error'));

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      const result = await service.getSuggestionsWithContext('test');

      expect(result).toEqual([]);
    });

    it('should log context errors', async () => {
      const error = new Error('Context error');
      mockElasticsearch.search.mockRejectedValue(error);

      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });
      await service.getSuggestionsWithContext('test');

      expect(mockLogger.error).toHaveBeenCalledWith({ error }, 'Context autocomplete failed');
    });
  });

  // =============================================================================
  // Class Structure
  // =============================================================================

  describe('Class Structure', () => {
    it('should be instantiable', () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      expect(service).toBeInstanceOf(AutocompleteService);
    });

    it('should have getSuggestions method', () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      expect(typeof service.getSuggestions).toBe('function');
    });

    it('should have getSuggestionsWithContext method', () => {
      const service = new AutocompleteService({ elasticsearch: mockElasticsearch, logger: mockLogger });

      expect(typeof service.getSuggestionsWithContext).toBe('function');
    });
  });
});
