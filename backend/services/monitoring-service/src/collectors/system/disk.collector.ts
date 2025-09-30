export class DiskCollector {
  private name = 'DiskCollector';
  
  getName(): string {
    return this.name;
  }
  
  async start(): Promise<void> {
    // TODO: Implement disk metrics collection
  }
  
  async stop(): Promise<void> {
    // TODO: Implement cleanup
  }
}
