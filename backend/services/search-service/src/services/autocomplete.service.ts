import { Client } from '@elastic/elasticsearch';
import pino from 'pino';

export class AutocompleteService {
  private elasticsearch: Client;
  private logger: pino.Logger;

  constructor({ elasticsearch, logger }: any) {
    this.elasticsearch = elasticsearch;
    this.logger = logger;
  }

  /**
   * Get autocomplete suggestions using completion suggesters
   * Much faster than match_phrase_prefix and supports fuzzy matching
   */
  async getSuggestions(query: string, types: string[] = ['events', 'venues']) {
    if (!query || query.length < 2) return [];

    try {
      // Build suggest queries for each type
      const suggest: any = {};
      
      if (types.includes('venues')) {
        suggest.venue_suggest = {
          prefix: query,
          completion: {
            field: 'name.suggest',
            size: 5,
            skip_duplicates: true,
            fuzzy: {
              fuzziness: 'AUTO',
              min_length: 3
            }
          }
        };
      }
      
      if (types.includes('events')) {
        suggest.event_suggest = {
          prefix: query,
          completion: {
            field: 'title.suggest',
            size: 5,
            skip_duplicates: true,
            fuzzy: {
              fuzziness: 'AUTO',
              min_length: 3
            }
          }
        };
      }

      // Execute suggest query
      const response = await this.elasticsearch.search({
        index: types.map(t => t === 'events' ? 'events' : 'venues'),
        body: { suggest }
      });

      // Format and combine suggestions
      return this.formatSuggestions(response.suggest);
    } catch (error) {
      this.logger.error({ error }, 'Autocomplete failed');
      return [];
    }
  }

  /**
   * Get suggestions with context (e.g., only suggest venues in a specific city)
   */
  async getSuggestionsWithContext(query: string, context?: { city?: string; category?: string }) {
    if (!query || query.length < 2) return [];

    try {
      const suggest: any = {
        event_suggest: {
          prefix: query,
          completion: {
            field: 'title.suggest',
            size: 5,
            skip_duplicates: true,
            fuzzy: {
              fuzziness: 'AUTO',
              min_length: 3
            },
            contexts: context ? {
              category: context.category ? [context.category] : undefined,
              city: context.city ? [context.city] : undefined
            } : undefined
          }
        }
      };

      const response = await this.elasticsearch.search({
        index: 'events',
        body: { suggest }
      });

      return this.formatSuggestions(response.suggest);
    } catch (error) {
      this.logger.error({ error }, 'Context autocomplete failed');
      return [];
    }
  }

  /**
   * Format suggestions from Elasticsearch response
   */
  private formatSuggestions(suggestions: any): any[] {
    const results: any[] = [];

    // Process venue suggestions
    if (suggestions.venue_suggest) {
      for (const suggestion of suggestions.venue_suggest) {
        for (const option of suggestion.options || []) {
          results.push({
            type: 'venue',
            text: option.text,
            score: option._score,
            source: option._source
          });
        }
      }
    }

    // Process event suggestions
    if (suggestions.event_suggest) {
      for (const suggestion of suggestions.event_suggest) {
        for (const option of suggestion.options || []) {
          results.push({
            type: 'event',
            text: option.text,
            score: option._score,
            source: option._source
          });
        }
      }
    }

    // Sort by score and remove duplicates
    const unique = new Map();
    for (const result of results) {
      if (!unique.has(result.text) || unique.get(result.text).score < result.score) {
        unique.set(result.text, result);
      }
    }

    return Array.from(unique.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }
}
