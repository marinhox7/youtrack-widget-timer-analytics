import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

export interface VirtualizedDataHook<T> {
  visibleItems: T[];
  totalCount: number;
  isLoading: boolean;
  progress: number;
  loadMore: () => void;
  filterItems: (filter: any) => Promise<void>;
  sortItems: (sortBy: string, sortOrder: 'asc' | 'desc') => Promise<void>;
  scrollToTop: () => void;
  resetData: () => void;
}

interface VirtualizedDataOptions {
  chunkSize?: number;
  initialChunkSize?: number;
  enableWorker?: boolean;
}

export function useVirtualizedData<T>(
  rawData: T[],
  filterFn: (item: T, filter: any) => boolean,
  options: VirtualizedDataOptions = {}
): VirtualizedDataHook<T> {
  const {
    chunkSize = 50,
    initialChunkSize = 25,
    enableWorker = true
  } = options;

  // State management
  const [filteredData, setFilteredData] = useState<T[]>([]);
  const [visibleItems, setVisibleItems] = useState<T[]>([]);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFilter, setCurrentFilter] = useState<any>(null);

  // Refs for cleanup and optimization
  const workerRef = useRef<Worker | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitializedRef = useRef(false);

  // Initialize Web Worker
  useEffect(() => {
    if (!enableWorker || typeof Worker === 'undefined') {
      isInitializedRef.current = true;
      return;
    }

    try {
      // Create worker with explicit import
      const workerUrl = new URL('../workers/dataProcessor.worker.ts', import.meta.url);
      workerRef.current = new Worker(workerUrl, { type: 'module' });

      workerRef.current.onmessage = (e) => {
        const { type, data, error, progress: workerProgress, totalFiltered } = e.data;

        if (error) {
          console.error('Worker error:', error);
          setIsLoading(false);
          setProgress(0);
          return;
        }

        switch (type) {
          case 'READY':
            isInitializedRef.current = true;
            break;

          case 'PROGRESS':
            setProgress(workerProgress || 0);
            break;

          case 'FILTER_COMPLETE':
            setFilteredData(data);
            setVisibleItems(data.slice(0, initialChunkSize));
            setCurrentChunk(0);
            setIsLoading(false);
            setProgress(100);

            // Reset progress after a delay
            setTimeout(() => setProgress(0), 1000);
            break;

          case 'SORT_COMPLETE':
            setFilteredData(data);
            setVisibleItems(data.slice(0, Math.min(chunkSize, data.length)));
            setCurrentChunk(0);
            setIsLoading(false);
            break;
        }
      };

      workerRef.current.onerror = (error) => {
        console.error('Worker error:', error);
        setIsLoading(false);
        isInitializedRef.current = true;
      };

    } catch (error) {
      console.warn('Failed to create worker, falling back to main thread:', error);
      isInitializedRef.current = true;
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [enableWorker, chunkSize, initialChunkSize]);

  // Initialize with raw data
  useEffect(() => {
    if (rawData.length > 0 && !currentFilter) {
      setFilteredData(rawData);
      setVisibleItems(rawData.slice(0, initialChunkSize));
      setCurrentChunk(0);
    }
  }, [rawData, initialChunkSize, currentFilter]);

  // High-performance async filtering
  const filterItems = useCallback(async (filter: any) => {
    // Immediate UI response
    setIsLoading(true);
    setProgress(0);
    setCurrentFilter(filter);

    // Cancel previous operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Clear visible items immediately for instant feedback
    setVisibleItems([]);

    try {
      if (workerRef.current && isInitializedRef.current) {
        // Use Web Worker for background processing
        workerRef.current.postMessage({
          type: 'FILTER_DATA',
          data: rawData,
          filter,
          chunkSize: initialChunkSize
        });
      } else {
        // Fallback to chunked processing on main thread
        await processInChunksMainThread(rawData, filter);
      }
    } catch (error) {
      console.error('Filter error:', error);
      setIsLoading(false);
      setProgress(0);
    }
  }, [rawData, initialChunkSize, filterFn]);

  // Optimized sorting
  const sortItems = useCallback(async (sortBy: string, sortOrder: 'asc' | 'desc') => {
    setIsLoading(true);

    if (workerRef.current && isInitializedRef.current) {
      workerRef.current.postMessage({
        type: 'SORT_DATA',
        data: filteredData,
        sortBy,
        sortOrder
      });
    } else {
      // Fallback sorting on main thread
      const sorted = [...filteredData].sort((a: any, b: any) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];

        if (typeof aVal === 'string') {
          return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        } else {
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }
      });

      setFilteredData(sorted);
      setVisibleItems(sorted.slice(0, chunkSize));
      setCurrentChunk(0);
      setIsLoading(false);
    }
  }, [filteredData, chunkSize]);

  // Fallback chunked processing for main thread
  const processInChunksMainThread = useCallback(async (data: T[], filter: any) => {
    const results: T[] = [];
    const CHUNK_SIZE = 100;
    const chunks = Math.ceil(data.length / CHUNK_SIZE);

    for (let i = 0; i < chunks; i++) {
      // Check for abort
      if (abortControllerRef.current?.signal.aborted) {
        break;
      }

      // Process chunk
      const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const filtered = chunk.filter(item => filterFn(item, filter));
      results.push(...filtered);

      // Update progress
      const currentProgress = ((i + 1) / chunks) * 100;
      setProgress(currentProgress);

      // Show progressive results
      if (i === 0 || i % 5 === 0 || i === chunks - 1) {
        setVisibleItems(results.slice(0, initialChunkSize));
      }

      // Yield control to browser
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    setFilteredData(results);
    setVisibleItems(results.slice(0, initialChunkSize));
    setCurrentChunk(0);
    setIsLoading(false);
    setProgress(0);
  }, [filterFn, initialChunkSize]);

  // Load more items (virtual scrolling)
  const loadMore = useCallback(() => {
    if (isLoading) return;

    const nextChunk = currentChunk + 1;
    const start = nextChunk * chunkSize;
    const end = start + chunkSize;
    const newItems = filteredData.slice(start, end);

    if (newItems.length > 0) {
      setVisibleItems(prev => [...prev, ...newItems]);
      setCurrentChunk(nextChunk);
    }
  }, [currentChunk, chunkSize, filteredData, isLoading]);

  // Scroll to top utility
  const scrollToTop = useCallback(() => {
    setVisibleItems(filteredData.slice(0, initialChunkSize));
    setCurrentChunk(0);
  }, [filteredData, initialChunkSize]);

  // Reset data utility
  const resetData = useCallback(() => {
    setFilteredData(rawData);
    setVisibleItems(rawData.slice(0, initialChunkSize));
    setCurrentChunk(0);
    setCurrentFilter(null);
    setIsLoading(false);
    setProgress(0);
  }, [rawData, initialChunkSize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    visibleItems,
    totalCount: filteredData.length,
    isLoading,
    progress,
    loadMore,
    filterItems,
    sortItems,
    scrollToTop,
    resetData
  };
}