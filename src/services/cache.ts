/**
 * Advanced Cache System for YouTrack Timer Dashboard
 * Provides intelligent caching with TTL, LRU eviction, and performance monitoring
 */

import { CacheEntry, CacheManager, CacheStats, CacheConfig } from '../types';

/**
 * In-memory cache implementation with LRU eviction and TTL support
 */
export class MemoryCache implements CacheManager {
  private static instance: MemoryCache;
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private hitCount = 0;
  private missCount = 0;
  private accessCounter = 0;

  static getInstance(): MemoryCache {
    if (!MemoryCache.instance) {
      MemoryCache.instance = new MemoryCache();
    }
    return MemoryCache.instance;
  }

  constructor(
    private config: Required<CacheConfig> = {
      enabled: true,
      defaultTtl: 30000, // 30 seconds
      maxEntries: 1000,
      strategy: 'lru'
    }
  ) {
    // Start cleanup interval for expired entries
    setInterval(() => this.cleanup(), Math.min(config.defaultTtl / 2, 30000));
  }

  /**
   * Get cached value by key
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.config.enabled) {
      this.missCount++;
      return null;
    }

    const entry = this.cache.get(key);

    if (!entry) {
      this.missCount++;
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.missCount++;
      return null;
    }

    // Update access order for LRU
    this.accessOrder.set(key, ++this.accessCounter);
    this.hitCount++;

    console.log(`[Cache] Hit for key: ${key}`);
    return entry.data as T;
  }

  /**
   * Set cache value with optional TTL
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const effectiveTtl = ttl ?? this.config.defaultTtl;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: effectiveTtl,
      key,
      version: '1.0'
    };

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxEntries) {
      await this.evictEntries();
    }

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);

    console.log(`[Cache] Set key: ${key}, TTL: ${effectiveTtl}ms`);
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    this.accessOrder.delete(key);

    if (deleted) {
      console.log(`[Cache] Deleted key: ${key}`);
    }

    return deleted;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.accessCounter = 0;

    console.log('[Cache] Cleared all entries');
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get all cache keys
   */
  async keys(): Promise<string[]> {
    // Clean expired entries first
    await this.cleanup();
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<CacheStats> {
    const now = Date.now();
    const entries = Array.from(this.cache.values());
    const validEntries = entries.filter(entry => !this.isExpired(entry));

    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;
    const missRate = totalRequests > 0 ? (this.missCount / totalRequests) * 100 : 0;

    const timestamps = validEntries.map(entry => entry.timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : undefined;
    const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : undefined;

    // Estimate size (rough calculation)
    const totalSize = validEntries.reduce((size, entry) => {
      return size + JSON.stringify(entry.data).length + entry.key.length + 100; // Overhead estimate
    }, 0);

    return {
      totalEntries: validEntries.length,
      totalSize,
      hitRate,
      missRate,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Check if cache entry has expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Remove expired entries
   */
  private async cleanup(): Promise<void> {
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(`[Cache] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Evict entries when cache is full
   */
  private async evictEntries(): Promise<void> {
    const entriesToEvict = Math.max(1, Math.floor(this.config.maxEntries * 0.1)); // Evict 10%

    if (this.config.strategy === 'lru') {
      await this.evictLRU(entriesToEvict);
    } else if (this.config.strategy === 'fifo') {
      await this.evictFIFO(entriesToEvict);
    } else {
      await this.evictByTTL(entriesToEvict);
    }
  }

  /**
   * Evict least recently used entries
   */
  private async evictLRU(count: number): Promise<void> {
    const sortedByAccess = Array.from(this.accessOrder.entries())
      .sort((a, b) => a[1] - b[1]) // Sort by access order (oldest first)
      .slice(0, count);

    for (const [key] of sortedByAccess) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    console.log(`[Cache] Evicted ${sortedByAccess.length} LRU entries`);
  }

  /**
   * Evict first-in-first-out entries
   */
  private async evictFIFO(count: number): Promise<void> {
    const sortedByTimestamp = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp) // Sort by timestamp (oldest first)
      .slice(0, count);

    for (const [key] of sortedByTimestamp) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    console.log(`[Cache] Evicted ${sortedByTimestamp.length} FIFO entries`);
  }

  /**
   * Evict entries with shortest remaining TTL
   */
  private async evictByTTL(count: number): Promise<void> {
    const now = Date.now();
    const sortedByTimeToLive = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        entry,
        timeToLive: entry.ttl - (now - entry.timestamp)
      }))
      .sort((a, b) => a.timeToLive - b.timeToLive) // Sort by remaining TTL (shortest first)
      .slice(0, count);

    for (const { key } of sortedByTimeToLive) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    console.log(`[Cache] Evicted ${sortedByTimeToLive.length} entries by TTL`);
  }

  /**
   * Get cache configuration
   */
  getConfig(): Required<CacheConfig> {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[Cache] Configuration updated:', newConfig);
  }
}

/**
 * Cache key generator for consistent key creation
 */
export class CacheKeyGenerator {
  private static readonly SEPARATOR = ':';
  private static readonly VERSION = 'v1';

  /**
   * Generate cache key for API requests
   */
  static apiKey(endpoint: string, params?: Record<string, any>): string {
    const paramString = params ?
      Object.keys(params)
        .sort()
        .map(key => `${key}=${JSON.stringify(params[key])}`)
        .join('&') : '';

    return [
      'api',
      this.VERSION,
      endpoint.replace(/[^a-zA-Z0-9]/g, '_'),
      paramString ? this.hashString(paramString) : 'no_params'
    ].join(this.SEPARATOR);
  }

  /**
   * Generate cache key for timer data
   */
  static timerKey(projectId?: string, userId?: string): string {
    const parts = ['timers', this.VERSION];

    if (projectId) parts.push(`project_${projectId}`);
    if (userId) parts.push(`user_${userId}`);

    return parts.join(this.SEPARATOR);
  }

  /**
   * Generate cache key for statistics
   */
  static statsKey(type: string, scope?: string): string {
    const parts = ['stats', this.VERSION, type];

    if (scope) parts.push(scope);

    return parts.join(this.SEPARATOR);
  }

  /**
   * Generate cache key for user data
   */
  static userKey(userId: string): string {
    return ['user', this.VERSION, userId].join(this.SEPARATOR);
  }

  /**
   * Generate cache key for project data
   */
  static projectKey(projectId: string): string {
    return ['project', this.VERSION, projectId].join(this.SEPARATOR);
  }

  /**
   * Simple string hash function
   */
  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * Cache decorator for automatic method caching
 */
export function Cached(ttl?: number, keyGenerator?: (...args: any[]) => string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const cache = new MemoryCache();

    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator ?
        keyGenerator.apply(this, args) :
        `${target.constructor.name}_${propertyName}_${JSON.stringify(args)}`;

      // Try to get from cache first
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await method.apply(this, args);

      // Cache the result
      await cache.set(cacheKey, result, ttl);

      return result;
    };

    return descriptor;
  };
}

/**
 * Global cache instance for application-wide use
 */
export const globalCache = new MemoryCache({
  enabled: true,
  defaultTtl: 30000, // 30 seconds
  maxEntries: 1000,
  strategy: 'lru'
});

/**
 * Cache middleware for API requests
 */
export class CacheMiddleware {
  constructor(private cache: CacheManager = globalCache) {}

  /**
   * Wrap API function with caching
   */
  wrap<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    keyGenerator: (...args: T) => string,
    ttl?: number
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const cacheKey = keyGenerator(...args);

      // Try cache first
      const cached = await this.cache.get<R>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute function
      const result = await fn(...args);

      // Cache result
      await this.cache.set(cacheKey, result, ttl);

      return result;
    };
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: RegExp): Promise<number> {
    const keys = await this.cache.keys();
    const matchingKeys = keys.filter(key => pattern.test(key));

    let deletedCount = 0;
    for (const key of matchingKeys) {
      const deleted = await this.cache.delete(key);
      if (deleted) deletedCount++;
    }

    console.log(`[Cache] Invalidated ${deletedCount} entries matching pattern: ${pattern}`);
    return deletedCount;
  }

  /**
   * Warm up cache with precomputed values
   */
  async warmUp(entries: Array<{ key: string; data: any; ttl?: number }>): Promise<void> {
    console.log(`[Cache] Warming up with ${entries.length} entries`);

    for (const { key, data, ttl } of entries) {
      await this.cache.set(key, data, ttl);
    }
  }
}