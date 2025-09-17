/**
 * Optimized Data Hooks
 * Provides performance-optimized data fetching and state management
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { YouTrackAPI } from '../services/api';
import { MemoryCache } from '../services/cache';
import { PerformanceMonitor } from '../services/performance';
import { Logger } from '../services/logger';

interface UseOptimizedDataOptions {
  refreshInterval?: number;
  staleTime?: number;
  cacheKey?: string;
  enabled?: boolean;
  retry?: number;
  retryDelay?: number;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

interface DataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
  lastUpdated: number | null;
  refetch: () => Promise<void>;
  invalidate: () => void;
}

/**
 * Optimized data fetching hook with caching, deduplication, and performance monitoring
 */
export function useOptimizedData<T>(
  fetcher: () => Promise<T>,
  options: UseOptimizedDataOptions = {}
): DataState<T> {
  const {
    refreshInterval = 30000,
    staleTime = 5000,
    cacheKey,
    enabled = true,
    retry = 3,
    retryDelay = 1000,
    onSuccess,
    onError
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const cache = useMemo(() => MemoryCache.getInstance(), []);
  const logger = Logger.getLogger('useOptimizedData');
  const monitor = PerformanceMonitor.getInstance();

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const isActiveRef = useRef(true);

  // Memoized cache key
  const finalCacheKey = useMemo(() => {
    if (cacheKey) return cacheKey;
    // Generate a cache key based on the fetcher function string
    return `data_${fetcher.toString().slice(0, 50).replace(/\s+/g, '_')}`;
  }, [cacheKey, fetcher]);

  // Check if data is stale
  const checkStaleStatus = useCallback(() => {
    if (!lastUpdated) return true;
    return Date.now() - lastUpdated > staleTime;
  }, [lastUpdated, staleTime]);

  // Optimized fetch function with performance monitoring
  const fetchData = useCallback(async (isBackground = false) => {
    if (!enabled || !isActiveRef.current) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      if (!isBackground) {
        setLoading(true);
        setError(null);
      }

      // Check cache first
      if (finalCacheKey) {
        const cachedData = await cache.get(finalCacheKey);
        if (cachedData && !checkStaleStatus()) {
          setData(cachedData as T);
          setIsStale(false);
          if (!isBackground) setLoading(false);
          monitor.recordMetric({
            name: 'cache_hit',
            value: 1,
            unit: 'count',
            timestamp: Date.now(),
            category: 'cache',
            tags: { key: finalCacheKey }
          });
          return;
        }
      }

      // Measure fetch performance
      const startTime = performance.now();

      const result = await fetcher();

      const endTime = performance.now();
      const duration = endTime - startTime;

      monitor.recordMetric({
        name: 'data_fetch_time',
        value: duration,
        unit: 'ms',
        timestamp: Date.now(),
        category: 'api',
        tags: { cacheKey: finalCacheKey }
      });

      if (!isActiveRef.current) return;

      // Update state
      setData(result);
      setLastUpdated(Date.now());
      setIsStale(false);
      setError(null);
      retryCountRef.current = 0;

      // Cache the result
      if (finalCacheKey) {
        await cache.set(finalCacheKey, result, staleTime);
      }

      // Call success callback
      if (onSuccess) {
        onSuccess(result);
      }

      logger.debug('Data fetched successfully', {
        cacheKey: finalCacheKey,
        duration,
        background: isBackground
      });

    } catch (err) {
      if (!isActiveRef.current) return;

      const error = err as Error;

      // Don't handle aborted requests
      if (error.name === 'AbortError') return;

      logger.error('Data fetch failed', error, { cacheKey: finalCacheKey });

      // Retry logic
      if (retryCountRef.current < retry) {
        retryCountRef.current++;

        setTimeout(() => {
          if (isActiveRef.current) {
            fetchData(isBackground);
          }
        }, retryDelay * retryCountRef.current);

        return;
      }

      setError(error.message);

      if (onError) {
        onError(error);
      }

      monitor.recordMetric({
        name: 'data_fetch_error',
        value: 1,
        unit: 'count',
        timestamp: Date.now(),
        category: 'api',
        tags: {
          cacheKey: finalCacheKey,
          error: error.message
        }
      });

    } finally {
      if (!isBackground && isActiveRef.current) {
        setLoading(false);
      }
    }
  }, [
    enabled, finalCacheKey, fetcher, staleTime, retry, retryDelay,
    onSuccess, onError, cache, logger, monitor, checkStaleStatus
  ]);

  // Manual refetch function
  const refetch = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  // Invalidate cache function
  const invalidate = useCallback(async () => {
    if (finalCacheKey) {
      await cache.delete(finalCacheKey);
      setIsStale(true);
    }
  }, [finalCacheKey, cache]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled, fetchData]);

  // Set up refresh interval
  useEffect(() => {
    if (!enabled || !refreshInterval) return;

    const interval = setInterval(() => {
      if (isActiveRef.current) {
        fetchData(true);
        setIsStale(checkStaleStatus());
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [enabled, refreshInterval, fetchData, checkStaleStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    isStale,
    lastUpdated,
    refetch,
    invalidate
  };
}

/**
 * Optimized hook for YouTrack timer data
 */
export function useTimerData(options: UseOptimizedDataOptions & {
  projectId?: string;
  userId?: string;
  limit?: number;
} = {}) {
  const { projectId, userId, limit = 100, ...restOptions } = options;

  const api = useMemo(() => new YouTrackAPI(), []);

  const fetcher = useCallback(async () => {
    const issues = await api.fetchIssuesWithTimers({
      projectId,
      limit
    });

    let timers = api.processTimerData ? api.processTimerData(issues) : [];

    if (userId) {
      timers = timers.filter((timer: any) => timer.username === userId);
    }

    return {
      timers,
      stats: api.calculateStats ? api.calculateStats(timers) : null
    };
  }, [api, projectId, userId, limit]);

  const cacheKey = useMemo(() => {
    return `timer_data_${projectId || 'all'}_${userId || 'all'}_${limit}`;
  }, [projectId, userId, limit]);

  return useOptimizedData(fetcher, {
    ...restOptions,
    cacheKey
  });
}

/**
 * Debounced hook for handling frequent updates
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Throttled hook for handling high-frequency events
 */
export function useThrottled<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastCall = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((...args: any[]) => {
    const now = Date.now();

    if (now - lastCall.current >= delay) {
      lastCall.current = now;
      return callback(...args);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        lastCall.current = Date.now();
        callback(...args);
      }, delay - (now - lastCall.current));
    }
  }, [callback, delay]) as T;
}

/**
 * Intersection observer hook for lazy loading
 */
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLElement | null>, boolean] {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(target);

    return () => {
      observer.unobserve(target);
    };
  }, [options]);

  return [targetRef, isIntersecting];
}

/**
 * Virtual scrolling hook for large lists
 */
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
): {
  visibleItems: { item: T; index: number }[];
  scrollElementProps: {
    style: React.CSSProperties;
    onScroll: (e: React.UIEvent) => void;
  };
  totalHeight: number;
} {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  );

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, index) => ({
      item,
      index: startIndex + index
    }));
  }, [items, startIndex, endIndex]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const scrollElementProps = {
    style: {
      height: containerHeight,
      overflow: 'auto'
    } as React.CSSProperties,
    onScroll: handleScroll as React.UIEventHandler<HTMLDivElement>
  };

  return {
    visibleItems,
    scrollElementProps,
    totalHeight
  };
}

export default {
  useOptimizedData,
  useTimerData,
  useDebounced,
  useThrottled,
  useIntersectionObserver,
  useVirtualScroll
};