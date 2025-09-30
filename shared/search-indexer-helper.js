class SearchIndexerHelper {
  constructor(serviceName) {
    this.serviceName = serviceName;
  }

  async initialize() {
    console.log(`Search indexer initialized for ${this.serviceName}`);
  }

  async indexEvent(event) {
    console.log(`Indexing event ${event.id}`);
    return true;
  }
}

module.exports = { SearchIndexerHelper };
