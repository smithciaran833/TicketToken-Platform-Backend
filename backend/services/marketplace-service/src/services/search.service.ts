import { db } from '../config/database';
import { logger } from '../utils/logger';
import { ListingFilters, ListingWithDetails } from '../types/listing.types';
import { PaginationParams } from '../types/common.types';
import { cache } from './cache-integration';
import { SEARCH_CACHE_TTL } from '../utils/constants';

class SearchServiceClass {
  async searchListings(
    filters: ListingFilters,
    pagination: PaginationParams
  ): Promise<{ listings: ListingWithDetails[]; total: number }> {
    try {
      // Generate cache key
      const cacheKey = `search:${JSON.stringify({ filters, pagination })}`;
      
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached as string);
      }
      
      // Build query
      const query = db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .leftJoin('users as u', 'ml.seller_id', 'u.id')
        .where('ml.status', 'active');
      
      // Apply filters
      if (filters.eventId) {
        query.where('ml.event_id', filters.eventId);
      }
      
      if (filters.venueId) {
        query.where('ml.venue_id', filters.venueId);
      }
      
      if (filters.minPrice !== undefined) {
        query.where('ml.price', '>=', filters.minPrice);
      }
      
      if (filters.maxPrice !== undefined) {
        query.where('ml.price', '<=', filters.maxPrice);
      }
      
      if (filters.sellerId) {
        query.where('ml.seller_id', filters.sellerId);
      }
      
      if (filters.dateFrom) {
        query.where('e.start_date', '>=', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        query.where('e.start_date', '<=', filters.dateTo);
      }
      
      // Count total
      const countQuery = query.clone();
      const totalResult = await countQuery.count('* as count');
      const total = parseInt(totalResult[0].count as string, 10);
      
      // Apply pagination
      const offset = (pagination.page - 1) * pagination.limit;
      query.limit(pagination.limit).offset(offset);
      
      // Apply sorting
      const sortBy = pagination.sortBy || 'ml.listed_at';
      const sortOrder = pagination.sortOrder || 'desc';
      query.orderBy(sortBy, sortOrder);
      
      // Select fields
      const listings = await query.select(
        'ml.*',
        'e.name as event_name',
        'e.start_date as event_date',
        'v.name as venue_name',
        'u.username as seller_username'
      );
      
      // Cache results
      await cache.set(cacheKey, JSON.stringify({ listings, total }), { ttl: SEARCH_CACHE_TTL });
      
      return { listings, total };
    } catch (error) {
      logger.error('Error searching listings:', error);
      return { listings: [], total: 0 };
    }
  }
  
  async searchByEvent(eventId: string): Promise<ListingWithDetails[]> {
    try {
      const result = await this.searchListings(
        { eventId, status: 'active' },
        { page: 1, limit: 100, sortBy: 'price', sortOrder: 'asc' }
      );
      
      return result.listings;
    } catch (error) {
      logger.error('Error searching by event:', error);
      return [];
    }
  }
  
  async getTrending(limit: number = 10): Promise<ListingWithDetails[]> {
    try {
      // Get trending listings based on recent views/activity
      const listings = await db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .where('ml.status', 'active')
        .where('e.start_date', '>', new Date())
        .orderBy('ml.view_count', 'desc')
        .limit(limit)
        .select(
          'ml.*',
          'e.name as event_name',
          'e.start_date as event_date',
          'v.name as venue_name'
        );
      
      return listings;
    } catch (error) {
      logger.error('Error getting trending listings:', error);
      return [];
    }
  }
  
  async getRecommendations(userId: string, limit: number = 10): Promise<ListingWithDetails[]> {
    try {
      // Get user's purchase history to understand preferences
      const userHistory = await db('marketplace_transfers')
        .where('buyer_id', userId)
        .select('event_id')
        .distinct('event_id');
      
      const eventIds = userHistory.map(h => h.event_id);
      
      if (eventIds.length === 0) {
        // Return trending if no history
        return this.getTrending(limit);
      }
      
      // Find similar events
      const listings = await db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .where('ml.status', 'active')
        .whereIn('ml.venue_id', function() {
          this.select('venue_id')
            .from('events')
            .whereIn('id', eventIds);
        })
        .whereNotIn('ml.event_id', eventIds)
        .limit(limit)
        .select(
          'ml.*',
          'e.name as event_name',
          'e.start_date as event_date',
          'v.name as venue_name'
        );
      
      return listings;
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      return [];
    }
  }
}

export const SearchService = SearchServiceClass;
export const searchService = new SearchServiceClass();
