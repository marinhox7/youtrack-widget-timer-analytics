/**
 * Tests for the advanced cache system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryCache, CacheKeyGenerator, CacheMiddleware } from './cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache({
      enabled: true,
      defaultTtl: 1000,
      maxEntries: 5,
      strategy: 'lru'
    });
  });

  it('should store and retrieve data', async () => {
    await cache.set('test-key', 'test-value');
    const result = await cache.get('test-key');
    expect(result).toBe('test-value');
  });

  it('should return null for non-existent keys', async () => {
    const result = await cache.get('non-existent');
    expect(result).toBeNull();
  });

  it('should respect TTL and expire entries', async () => {
    await cache.set('expiring-key', 'test-value', 50);

    // Should exist immediately
    expect(await cache.get('expiring-key')).toBe('test-value');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should be expired
    expect(await cache.get('expiring-key')).toBeNull();
  });

  it('should handle cache size limits with LRU eviction', async () => {
    // Fill cache to capacity
    for (let i = 0; i < 5; i++) {
      await cache.set(`key-${i}`, `value-${i}`);
    }

    // Access key-0 to make it recently used
    await cache.get('key-0');

    // Add one more item to trigger eviction
    await cache.set('key-new', 'new-value');

    // key-0 should still exist (recently used)
    expect(await cache.get('key-0')).toBe('value-0');

    // key-1 should be evicted (least recently used)
    expect(await cache.get('key-1')).toBeNull();

    // New key should exist
    expect(await cache.get('key-new')).toBe('new-value');
  });

  it('should check if keys exist', async () => {
    await cache.set('existing-key', 'value');

    expect(await cache.has('existing-key')).toBe(true);
    expect(await cache.has('non-existing-key')).toBe(false);
  });

  it('should delete entries', async () => {
    await cache.set('deletable-key', 'value');
    expect(await cache.get('deletable-key')).toBe('value');

    const deleted = await cache.delete('deletable-key');
    expect(deleted).toBe(true);
    expect(await cache.get('deletable-key')).toBeNull();
  });

  it('should clear all entries', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    await cache.clear();

    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBeNull();
    expect((await cache.keys()).length).toBe(0);
  });

  it('should provide accurate statistics', async () => {
    // Add some entries
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    // Generate some hits and misses
    await cache.get('key1'); // hit
    await cache.get('key1'); // hit
    await cache.get('non-existent'); // miss

    const stats = await cache.stats();

    expect(stats.totalEntries).toBe(2);
    expect(stats.hitRate).toBeGreaterThan(0);
    expect(stats.missRate).toBeGreaterThan(0);
    expect(stats.totalSize).toBeGreaterThan(0);
  });
});

describe('CacheKeyGenerator', () => {
  it('should generate consistent API keys', () => {
    const params = { query: 'test', limit: 10 };
    const key1 = CacheKeyGenerator.apiKey('endpoint', params);
    const key2 = CacheKeyGenerator.apiKey('endpoint', params);

    expect(key1).toBe(key2);
  });

  it('should generate different keys for different parameters', () => {
    const key1 = CacheKeyGenerator.apiKey('endpoint', { query: 'test1' });
    const key2 = CacheKeyGenerator.apiKey('endpoint', { query: 'test2' });

    expect(key1).not.toBe(key2);
  });

  it('should generate timer keys with optional scope', () => {
    const globalKey = CacheKeyGenerator.timerKey();
    const projectKey = CacheKeyGenerator.timerKey('project-1');
    const userKey = CacheKeyGenerator.timerKey(undefined, 'user-1');
    const scopedKey = CacheKeyGenerator.timerKey('project-1', 'user-1');

    expect(globalKey).toContain('timers:v1');
    expect(projectKey).toContain('project_project-1');
    expect(userKey).toContain('user_user-1');
    expect(scopedKey).toContain('project_project-1');
    expect(scopedKey).toContain('user_user-1');
  });

  it('should generate stats keys', () => {
    const globalStats = CacheKeyGenerator.statsKey('global');
    const projectStats = CacheKeyGenerator.statsKey('project', 'TEST');

    expect(globalStats).toContain('stats:v1:global');
    expect(projectStats).toContain('stats:v1:project:TEST');
  });
});

describe('CacheMiddleware', () => {
  let cache: MemoryCache;
  let middleware: CacheMiddleware;

  beforeEach(() => {
    cache = new MemoryCache({
      enabled: true,
      defaultTtl: 1000,
      maxEntries: 10,
      strategy: 'lru'
    });
    middleware = new CacheMiddleware(cache);
  });

  it('should wrap functions with caching', async () => {
    let callCount = 0;
    const testFunction = vi.fn(async (arg: string) => {
      callCount++;
      return `result-${arg}-${callCount}`;
    });

    const cachedFunction = middleware.wrap(
      testFunction,
      (arg: string) => `test-${arg}`,
      500
    );

    // First call should execute function
    const result1 = await cachedFunction('input');
    expect(result1).toBe('result-input-1');
    expect(testFunction).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = await cachedFunction('input');
    expect(result2).toBe('result-input-1');
    expect(testFunction).toHaveBeenCalledTimes(1); // Still 1

    // Different input should execute function again
    const result3 = await cachedFunction('other');
    expect(result3).toBe('result-other-2');
    expect(testFunction).toHaveBeenCalledTimes(2);
  });

  it('should invalidate cache by pattern', async () => {
    await cache.set('users:v1:user1', { name: 'User 1' });
    await cache.set('users:v1:user2', { name: 'User 2' });
    await cache.set('projects:v1:proj1', { name: 'Project 1' });

    const deleted = await middleware.invalidatePattern(/^users:/);

    expect(deleted).toBe(2);
    expect(await cache.has('users:v1:user1')).toBe(false);
    expect(await cache.has('users:v1:user2')).toBe(false);
    expect(await cache.has('projects:v1:proj1')).toBe(true);
  });

  it('should warm up cache with precomputed values', async () => {
    const entries = [
      { key: 'warm-1', data: 'value-1', ttl: 1000 },
      { key: 'warm-2', data: 'value-2' },
    ];

    await middleware.warmUp(entries);

    expect(await cache.get('warm-1')).toBe('value-1');
    expect(await cache.get('warm-2')).toBe('value-2');
  });
});