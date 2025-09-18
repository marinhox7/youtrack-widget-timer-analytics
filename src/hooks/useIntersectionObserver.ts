import { useEffect, useRef, useState, useCallback } from 'react';

export interface IntersectionObserverHook {
  targetRef: React.RefObject<HTMLElement>;
  isIntersecting: boolean;
  intersectionRatio: number;
  disconnect: () => void;
  reconnect: () => void;
}

export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
): IntersectionObserverHook {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [intersectionRatio, setIntersectionRatio] = useState(0);
  const targetRef = useRef<HTMLElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const defaultOptions: IntersectionObserverInit = {
    threshold: [0, 0.1, 0.5, 1],
    rootMargin: '50px',
    ...options
  };

  const createObserver = useCallback(() => {
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback for environments without IntersectionObserver
      setIsIntersecting(true);
      setIntersectionRatio(1);
      return;
    }

    observerRef.current = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
      setIntersectionRatio(entry.intersectionRatio);
    }, defaultOptions);

    if (targetRef.current) {
      observerRef.current.observe(targetRef.current);
    }
  }, [defaultOptions]);

  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    createObserver();
  }, [disconnect, createObserver]);

  useEffect(() => {
    createObserver();

    return () => {
      disconnect();
    };
  }, [createObserver, disconnect]);

  // Handle target changes
  useEffect(() => {
    if (targetRef.current && observerRef.current) {
      observerRef.current.observe(targetRef.current);
    }

    return () => {
      if (targetRef.current && observerRef.current) {
        observerRef.current.unobserve(targetRef.current);
      }
    };
  }, []);

  return {
    targetRef,
    isIntersecting,
    intersectionRatio,
    disconnect,
    reconnect
  };
}

// Specialized hook for infinite scrolling
export function useInfiniteScroll(
  callback: () => void,
  options: IntersectionObserverInit & { enabled?: boolean } = {}
) {
  const { enabled = true, ...intersectionOptions } = options;
  const { targetRef, isIntersecting } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '100px',
    ...intersectionOptions
  });

  useEffect(() => {
    if (isIntersecting && enabled) {
      callback();
    }
  }, [isIntersecting, enabled, callback]);

  return targetRef;
}

// Hook for lazy loading components
export function useLazyLoad<T>(
  loadFn: () => Promise<T>,
  options: IntersectionObserverInit = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { targetRef, isIntersecting } = useIntersectionObserver(options);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (isIntersecting && !hasLoadedRef.current && !loading) {
      hasLoadedRef.current = true;
      setLoading(true);
      setError(null);

      loadFn()
        .then(result => {
          setData(result);
        })
        .catch(err => {
          setError(err instanceof Error ? err : new Error('Failed to load'));
          hasLoadedRef.current = false; // Allow retry
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isIntersecting, loadFn, loading]);

  const retry = useCallback(() => {
    hasLoadedRef.current = false;
    setError(null);
  }, []);

  return {
    targetRef,
    data,
    loading,
    error,
    retry,
    isVisible: isIntersecting
  };
}