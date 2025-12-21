/**
 * Redis Geo Operations
 * 
 * Geospatial operations for location-based features like venue and event discovery.
 * Stores locations as latitude/longitude coordinates.
 */

import Redis from 'ioredis';
import { getRedisClient } from '../connection-manager';
import { RedisOperationError, GeoLocation, GeoSearchResult, GeoSearchOptions } from '../types';

/**
 * Geo Operations Class
 */
export class GeoOperations {
  private client: Redis | null = null;
  
  private async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await getRedisClient();
    }
    return this.client;
  }
  
  /**
   * Add location to geospatial index
   */
  async geoadd(key: string, longitude: number, latitude: number, member: string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.geoadd(key, longitude, latitude, member);
    } catch (error) {
      throw new RedisOperationError('GEOADD failed', 'GEOADD', key, error as Error);
    }
  }
  
  /**
   * Add multiple locations
   */
  async geoaddMulti(key: string, locations: GeoLocation[]): Promise<number> {
    try {
      const client = await this.getClient();
      const args: (number | string)[] = [];
      locations.forEach(loc => {
        args.push(loc.longitude, loc.latitude, loc.member);
      });
      // @ts-ignore - ioredis typing issue
      return await client.geoadd(key, ...args);
    } catch (error) {
      throw new RedisOperationError('GEOADD failed', 'GEOADD', key, error as Error);
    }
  }
  
  /**
   * Get position of member
   */
  async geopos(key: string, ...members: string[]): Promise<(GeoLocation | null)[]> {
    try {
      const client = await this.getClient();
      const result = await client.geopos(key, ...members);
      return result.map((pos, idx) => {
        if (!pos) return null;
        return {
          longitude: parseFloat(pos[0]),
          latitude: parseFloat(pos[1]),
          member: members[idx],
        };
      });
    } catch (error) {
      throw new RedisOperationError('GEOPOS failed', 'GEOPOS', key, error as Error);
    }
  }
  
  /**
   * Get distance between two members
   */
  async geodist(key: string, member1: string, member2: string, unit: 'm' | 'km' | 'mi' | 'ft' = 'm'): Promise<number | null> {
    try {
      const client = await this.getClient();
      const result = unit === 'm' 
        ? await client.geodist(key, member1, member2)
        : await client.geodist(key, member1, member2, unit as any);
      return result !== null ? parseFloat(result) : null;
    } catch (error) {
      throw new RedisOperationError('GEODIST failed', 'GEODIST', key, error as Error);
    }
  }
  
  /**
   * Find members within radius of point
   */
  async georadius(
    key: string,
    longitude: number,
    latitude: number,
    radius: number,
    unit: 'm' | 'km' | 'mi' | 'ft' = 'km',
    options?: GeoSearchOptions
  ): Promise<string[] | GeoSearchResult[]> {
    try {
      const client = await this.getClient();
      const args: any[] = [key, longitude, latitude, radius, unit];
      
      if (options?.withCoord) args.push('WITHCOORD');
      if (options?.withDist) args.push('WITHDIST');
      if (options?.count) args.push('COUNT', options.count);
      if (options?.sort) args.push(options.sort);
      
      const result = await client.georadius(...(args as [string, number, number, number, string, ...any[]]));
      
      return this.parseGeoResults(result, options);
    } catch (error) {
      throw new RedisOperationError('GEORADIUS failed', 'GEORADIUS', key, error as Error);
    }
  }
  
  /**
   * Find members within radius of another member
   */
  async georadiusbymember(
    key: string,
    member: string,
    radius: number,
    unit: 'm' | 'km' | 'mi' | 'ft' = 'km',
    options?: GeoSearchOptions
  ): Promise<string[] | GeoSearchResult[]> {
    try {
      const client = await this.getClient();
      const args: any[] = [key, member, radius, unit];
      
      if (options?.withCoord) args.push('WITHCOORD');
      if (options?.withDist) args.push('WITHDIST');
      if (options?.count) args.push('COUNT', options.count);
      if (options?.sort) args.push(options.sort);
      
      const result = await client.georadiusbymember(...(args as [string, string, number, string, ...any[]]));
      
      return this.parseGeoResults(result, options);
    } catch (error) {
      throw new RedisOperationError('GEORADIUSBYMEMBER failed', 'GEORADIUSBYMEMBER', key, error as Error);
    }
  }
  
  /**
   * Get geohash of members
   */
  async geohash(key: string, ...members: string[]): Promise<(string | null)[]> {
    try {
      const client = await this.getClient();
      return await client.geohash(key, ...members);
    } catch (error) {
      throw new RedisOperationError('GEOHASH failed', 'GEOHASH', key, error as Error);
    }
  }
  
  /**
   * Remove location from geospatial index
   */
  async georem(key: string, ...members: string[]): Promise<number> {
    try {
      const client = await this.getClient();
      // GEOREM uses ZREM under the hood
      return await client.zrem(key, ...members);
    } catch (error) {
      throw new RedisOperationError('GEOREM failed', 'GEOREM', key, error as Error);
    }
  }
  
  /**
   * Parse geo results based on options
   */
  private parseGeoResults(result: any, options?: GeoSearchOptions): string[] | GeoSearchResult[] {
    if (!options?.withDist && !options?.withCoord) {
      return result as string[];
    }
    
    // Parse complex results
    const parsed: GeoSearchResult[] = [];
    result.forEach((item: any) => {
      if (Array.isArray(item)) {
        const geoResult: GeoSearchResult = {
          member: item[0],
          longitude: 0,
          latitude: 0,
        };
        
        let idx = 1;
        if (options?.withDist) {
          geoResult.distance = parseFloat(item[idx]);
          geoResult.unit = options.unit || 'km';
          idx++;
        }
        
        if (options?.withCoord && item[idx]) {
          geoResult.longitude = parseFloat(item[idx][0]);
          geoResult.latitude = parseFloat(item[idx][1]);
        }
        
        parsed.push(geoResult);
      } else {
        parsed.push({ member: item, longitude: 0, latitude: 0 });
      }
    });
    
    return parsed;
  }
}

// Singleton instance
let geoOps: GeoOperations | null = null;

export function getGeoOps(): GeoOperations {
  if (!geoOps) {
    geoOps = new GeoOperations();
  }
  return geoOps;
}

// Convenience functions
export const geoadd = (key: string, longitude: number, latitude: number, member: string) => getGeoOps().geoadd(key, longitude, latitude, member);
export const geoaddMulti = (key: string, locations: GeoLocation[]) => getGeoOps().geoaddMulti(key, locations);
export const geopos = (key: string, ...members: string[]) => getGeoOps().geopos(key, ...members);
export const geodist = (key: string, member1: string, member2: string, unit?: 'm' | 'km' | 'mi' | 'ft') => getGeoOps().geodist(key, member1, member2, unit);
export const georadius = (key: string, longitude: number, latitude: number, radius: number, unit?: 'm' | 'km' | 'mi' | 'ft', options?: GeoSearchOptions) => getGeoOps().georadius(key, longitude, latitude, radius, unit, options);
export const georadiusbymember = (key: string, member: string, radius: number, unit?: 'm' | 'km' | 'mi' | 'ft', options?: GeoSearchOptions) => getGeoOps().georadiusbymember(key, member, radius, unit, options);
export const geohash = (key: string, ...members: string[]) => getGeoOps().geohash(key, ...members);
export const georem = (key: string, ...members: string[]) => getGeoOps().georem(key, ...members);
