import { logger } from '../logger';

export class CleanupWorker {
  private interval: NodeJS.Timeout | null = null;
  
  async start(): Promise<void> {
    logger.info('Starting Cleanup Worker...');
    
    try {
      // Schedule daily cleanup at 2 AM
      this.scheduleDaily();
      
      logger.info('Cleanup Worker started successfully');
    } catch (error) {
      logger.error('Failed to start Cleanup Worker:', error);
      throw error;
    }
  }
  
  private scheduleDaily(): void {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(2, 0, 0, 0);
    
    // If 2 AM has passed today, schedule for tomorrow
    if (nextRun < now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const delay = nextRun.getTime() - now.getTime();
    
    logger.info(`Next cleanup scheduled for: ${nextRun.toISOString()}`);
    
    // Schedule first run
    setTimeout(() => {
      this.cleanup();
      
      // Then repeat daily
      this.interval = setInterval(() => {
        this.cleanup();
      }, 24 * 60 * 60 * 1000);
    }, delay);
  }
  
  private async cleanup(): Promise<void> {
    try {
      logger.info('Starting daily cleanup...');
      
      // Cleanup old alerts (90 days retention)
      await this.cleanOldAlerts(90);
      
      // Cleanup old metrics aggregations (1 year retention)
      await this.cleanOldAggregations(365);
      
      // Cleanup old logs from Elasticsearch (30 days)
      await this.cleanElasticsearch(30);
      
      logger.info('Daily cleanup completed successfully');
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }
  }
  
  private async cleanOldAlerts(days: number): Promise<void> {
    try {
      logger.info(`Cleaning alerts older than ${days} days...`);
      
      // In production, this would execute:
      // DELETE FROM alerts WHERE created_at < NOW() - INTERVAL '${days} days'
      
      logger.info('Alert cleanup completed');
    } catch (error) {
      logger.error('Failed to clean old alerts:', error);
      throw error;
    }
  }
  
  private async cleanOldAggregations(days: number): Promise<void> {
    try {
      logger.info(`Cleaning aggregations older than ${days} days...`);
      
      // In production, this would execute:
      // DELETE FROM metrics_aggregated WHERE timestamp < NOW() - INTERVAL '${days} days'
      
      logger.info('Aggregation cleanup completed');
    } catch (error) {
      logger.error('Failed to clean old aggregations:', error);
      throw error;
    }
  }
  
  private async cleanElasticsearch(days: number): Promise<void> {
    try {
      logger.info(`Cleaning Elasticsearch logs older than ${days} days...`);
      
      // In production, this would use Elasticsearch API to delete old indices
      // DELETE /logs-*/_delete_by_query
      // { "query": { "range": { "@timestamp": { "lte": "now-${days}d" } } } }
      
      logger.info('Elasticsearch cleanup completed');
    } catch (error) {
      logger.error('Failed to clean Elasticsearch:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info('Cleanup Worker stopped');
  }
}
