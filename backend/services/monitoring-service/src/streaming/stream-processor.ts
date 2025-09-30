import { logger } from '../utils/logger';
import { kafkaProducer } from './kafka-producer';

interface EventWindow {
  startTime: Date;
  endTime: Date;
  events: any[];
  aggregates: Map<string, number>;
}

export class StreamProcessor {
  private windows: Map<string, EventWindow> = new Map();
  private windowSizeMs = 60000; // 1 minute windows

  async processEventStream(events: any[]) {
    const now = new Date();
    const windowKey = Math.floor(now.getTime() / this.windowSizeMs).toString();
    
    if (!this.windows.has(windowKey)) {
      this.windows.set(windowKey, {
        startTime: new Date(parseInt(windowKey) * this.windowSizeMs),
        endTime: new Date((parseInt(windowKey) + 1) * this.windowSizeMs),
        events: [],
        aggregates: new Map(),
      });
    }

    const window = this.windows.get(windowKey)!;
    window.events.push(...events);

    // Perform real-time aggregations
    for (const event of events) {
      this.updateAggregates(window, event);
    }

    // Check for patterns
    await this.detectPatterns(window);

    // Clean old windows
    this.cleanOldWindows();
  }

  private updateAggregates(window: EventWindow, event: any) {
    const key = event.metric_name || event.type;
    const current = window.aggregates.get(key) || 0;
    window.aggregates.set(key, current + (event.value || 1));
  }

  private async detectPatterns(window: EventWindow) {
    // Detect high-frequency patterns
    for (const [key, count] of window.aggregates) {
      if (count > 100) {
        logger.warn(`High frequency pattern detected: ${key} = ${count} events/min`);
        
        await kafkaProducer.sendAlert({
          title: `High Frequency Pattern: ${key}`,
          severity: 'warning',
          pattern: key,
          count,
          window: window.startTime,
        });
      }
    }

    // Detect fraud patterns in real-time
    const fraudEvents = window.events.filter(e => e.type === 'fraud');
    if (fraudEvents.length > 5) {
      logger.error(`🚨 FRAUD SPIKE: ${fraudEvents.length} fraud events in 1 minute!`);
      
      await kafkaProducer.sendAlert({
        title: 'Fraud Spike Detected',
        severity: 'critical',
        count: fraudEvents.length,
        window: window.startTime,
      });
    }
  }

  private cleanOldWindows() {
    const now = Date.now();
    const cutoff = now - (5 * this.windowSizeMs); // Keep 5 minutes of windows
    
    for (const [key, window] of this.windows) {
      if (window.startTime.getTime() < cutoff) {
        this.windows.delete(key);
      }
    }
  }

  getWindowStats(): any {
    const stats = {
      activeWindows: this.windows.size,
      totalEvents: 0,
      topPatterns: [] as any[],
    };

    for (const window of this.windows.values()) {
      stats.totalEvents += window.events.length;
    }

    // Get top patterns across all windows
    const allPatterns = new Map<string, number>();
    for (const window of this.windows.values()) {
      for (const [key, count] of window.aggregates) {
        allPatterns.set(key, (allPatterns.get(key) || 0) + count);
      }
    }

    stats.topPatterns = Array.from(allPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));

    return stats;
  }
}

export const streamProcessor = new StreamProcessor();
