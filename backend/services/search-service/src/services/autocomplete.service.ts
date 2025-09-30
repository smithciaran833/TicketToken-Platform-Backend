import { Client } from '@elastic/elasticsearch';
import pino from 'pino';

export class AutocompleteService {
  private elasticsearch: Client;
  private logger: pino.Logger;

  constructor({ elasticsearch, logger }: any) {
    this.elasticsearch = elasticsearch;
    this.logger = logger;
  }

  async getSuggestions(query: string) {
    if (!query || query.length < 2) return [];

    try {
      const response = await this.elasticsearch.search({
        index: ['venues', 'events'],
        size: 10,
        body: {
          query: {
            match_phrase_prefix: {
              name: {
                query: query,
                max_expansions: 10
              }
            }
          },
          _source: ['name']
        }
      });

      return response.hits.hits.map((hit: any) => hit._source.name);
    } catch (error) {
      this.logger.error({ error }, 'Autocomplete failed');
      return [];
    }
  }
}
