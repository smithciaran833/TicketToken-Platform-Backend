export class SearchIndexerHelper {
  constructor(private serviceName: string) {}
  
  async initialize(): Promise<void> {
    console.log(`Search indexer initialized for ${this.serviceName}`);
  }
  
  async indexEvent(event: any): Promise<boolean> {
    console.log(`Indexing event ${event.id}`);
    return true;
  }
}
