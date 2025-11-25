import { getRedis, getPubClient, getSubClient } from '../../config/redis';
import { RealTimeMetric } from '../../types';
import { logger } from '../../utils/logger';

export class RealtimeModel {
  private static redis = getRedis;
  private static pub = getPubClient;
  private static sub = getSubClient;
  
  static async updateRealTimeMetric(
    venueId: string,
    metricType: string,
    value: number
  ): Promise<void> {
    const redis = this.redis();
    const key = `realtime:${venueId}:${metricType}`;
    
    // Get previous value
    const previousValue = await redis.get(key);
    const prev = previousValue ? parseFloat(previousValue) : 0;
    
    // Update current value
    await redis.set(key, value.toString());
    await redis.expire(key, 300); // 5 minutes TTL
    
    // Calculate change
    const change = value - prev;
    const changePercent = prev > 0 ? ((change / prev) * 100) : 0;
    
    // Create metric object
    const metric: RealTimeMetric = {
      metricType: metricType as any,
      currentValue: value,
      previousValue: prev,
      change,
      changePercent,
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      lastUpdated: new Date()
    };
    
    // Publish update
    await this.publishMetricUpdate(venueId, metricType, metric);
  }
  
  static async getRealTimeMetric(
    venueId: string,
    metricType: string
  ): Promise<RealTimeMetric | null> {
    const redis = this.redis();
    const key = `realtime:${venueId}:${metricType}`;
    const dataKey = `realtime:data:${venueId}:${metricType}`;
    
    const value = await redis.get(key);
    const data = await redis.get(dataKey);
    
    if (value && data) {
      return JSON.parse(data);
    }
    
    return null;
  }
  
  static async incrementCounter(
    venueId: string,
    counterType: string,
    by: number = 1
  ): Promise<number> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    const value = await redis.incrby(key, by);
    
    // Update real-time metric
    await this.updateRealTimeMetric(venueId, counterType, value);
    
    return value;
  }
  
  static async getCounter(
    venueId: string,
    counterType: string
  ): Promise<number> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    const value = await redis.get(key);
    
    return value ? parseInt(value) : 0;
  }
  
  static async resetCounter(
    venueId: string,
    counterType: string
  ): Promise<void> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    await redis.set(key, '0');
  }
  
  static async publishMetricUpdate(
    venueId: string,
    metricType: string,
    data: any
  ): Promise<void> {
    const pub = this.pub();
    const channel = `metrics:${venueId}:${metricType}`;
    const dataKey = `realtime:data:${venueId}:${metricType}`;
    
    // Store data for future requests
    const redis = this.redis();
    await redis.set(dataKey, JSON.stringify(data));
    await redis.expire(dataKey, 300);
    
    // Publish to subscribers
    await pub.publish(channel, JSON.stringify(data));
  }
  
  static async subscribeToMetric(
    venueId: string,
    metricType: string,
    callback: (data: any) => void
  ): Promise<void> {
    const sub = this.sub();
    const channel = `metrics:${venueId}:${metricType}`;
    
    await sub.subscribe(channel);
    
    sub.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          logger.error('Error parsing metric update:', error);
        }
      }
    });
  }
  
  static async unsubscribeFromMetric(
    venueId: string,
    metricType: string
  ): Promise<void> {
    const sub = this.sub();
    const channel = `metrics:${venueId}:${metricType}`;
    await sub.unsubscribe(channel);
  }
  
  static async setGauge(
    venueId: string,
    gaugeName: string,
    value: number,
    max: number
  ): Promise<void> {
    const redis = this.redis();
    const key = `gauge:${venueId}:${gaugeName}`;
    
    const data = {
      current: value,
      max,
      percentage: (value / max) * 100,
      timestamp: new Date()
    };
    
    await redis.set(key, JSON.stringify(data));
    await redis.expire(key, 300);
    
    // Publish update
    await this.publishMetricUpdate(venueId, `gauge:${gaugeName}`, data);
  }
  
  static async getGauge(
    venueId: string,
    gaugeName: string
  ): Promise<any | null> {
    const redis = this.redis();
    const key = `gauge:${venueId}:${gaugeName}`;
    const value = await redis.get(key);
    
    return value ? JSON.parse(value) : null;
  }
}
