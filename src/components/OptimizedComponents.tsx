/**
 * Optimized React Components
 * High-performance components with built-in optimizations
 */

import React, { memo, useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useIntersectionObserver, useVirtualScroll } from '../hooks/useOptimizedData';
import { PerformanceMonitor, usePerformanceMonitor } from '../services/performance';
import { TimerEntry } from '../types';

// Performance-optimized timer item component
export const OptimizedTimerItem = memo<{
  timer: TimerEntry;
  onClick?: (timer: TimerEntry) => void;
  compact?: boolean;
}>(({ timer, onClick, compact = false }) => {
  usePerformanceMonitor('OptimizedTimerItem');

  const handleClick = useCallback(() => {
    onClick?.(timer);
  }, [onClick, timer]);

  const statusIcon = useMemo(() => {
    switch (timer.status) {
      case 'critical': return '🚨';
      case 'long': return '⚠️';
      case 'attention': return '⏰';
      default: return '✅';
    }
  }, [timer.status]);

  const formattedDuration = useMemo(() => {
    const hours = Math.floor(timer.elapsedMs / (1000 * 60 * 60));
    const minutes = Math.floor((timer.elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }, [timer.elapsedMs]);

  const itemClass = useMemo(() => {
    return `timer-item status-${timer.status} ${compact ? 'compact' : ''}`;
  }, [timer.status, compact]);

  return (
    <div className={itemClass} onClick={handleClick}>
      <div className="timer-status">
        <span className="status-icon">{statusIcon}</span>
      </div>
      <div className="timer-info">
        <div className="timer-header">
          <span className="issue-key">{timer.issueKey}</span>
          <span className="timer-duration">{formattedDuration}</span>
        </div>
        {!compact && (
          <>
            <div className="timer-summary">{timer.issueSummary}</div>
            <div className="timer-meta">
              <span className="project-name">{timer.projectShortName}</span>
              <span className="username">{timer.username}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

OptimizedTimerItem.displayName = 'OptimizedTimerItem';

// Virtualized timer list for handling large datasets
export const VirtualizedTimerList = memo<{
  timers: TimerEntry[];
  onTimerClick?: (timer: TimerEntry) => void;
  itemHeight?: number;
  height?: number;
  compact?: boolean;
}>(({ timers, onTimerClick, itemHeight = 80, height = 400, compact = false }) => {
  usePerformanceMonitor('VirtualizedTimerList');

  const { visibleItems, scrollElementProps, totalHeight } = useVirtualScroll(
    timers,
    itemHeight,
    height
  );

  const containerStyle = useMemo(() => ({
    ...scrollElementProps.style,
    position: 'relative' as const
  }), [scrollElementProps.style]);

  const contentStyle = useMemo(() => ({
    height: totalHeight,
    position: 'relative' as const
  }), [totalHeight]);

  return (
    <div {...scrollElementProps} style={containerStyle}>
      <div style={contentStyle}>
        {visibleItems.map(({ item: timer, index }) => (
          <div
            key={timer.id}
            style={{
              position: 'absolute',
              top: index * itemHeight,
              width: '100%',
              height: itemHeight
            }}
          >
            <OptimizedTimerItem
              timer={timer}
              onClick={onTimerClick}
              compact={compact}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

VirtualizedTimerList.displayName = 'VirtualizedTimerList';

// Lazy-loaded component wrapper
export const LazyComponent = memo<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
  threshold?: number;
}>(({ children, fallback = <div>Loading...</div>, threshold = 0.1 }) => {
  const [ref, isIntersecting] = useIntersectionObserver({ threshold });
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (isIntersecting && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [isIntersecting, hasLoaded]);

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      {hasLoaded ? children : fallback}
    </div>
  );
});

LazyComponent.displayName = 'LazyComponent';

// Optimized chart wrapper with lazy loading and error boundaries
export const OptimizedChart = memo<{
  type: 'line' | 'bar' | 'doughnut';
  data: any;
  options?: any;
  height?: number;
  loading?: boolean;
}>(({ type, data, options, height = 300, loading = false }) => {
  usePerformanceMonitor('OptimizedChart');

  const [chartModule, setChartModule] = useState<any>(null);
  const chartRef = useRef<any>(null);

  // Lazy load chart components
  useEffect(() => {
    const loadChart = async () => {
      try {
        const chartModule = await import('react-chartjs-2');
        const { Line, Bar, Doughnut } = chartModule;
        const components = { line: Line, bar: Bar, doughnut: Doughnut };
        setChartModule(components[type]);
      } catch (error) {
        console.error('Failed to load chart component:', error);
      }
    };

    loadChart();
  }, [type]);

  const memoizedOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    ...options
  }), [options]);

  if (loading || !chartModule) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div>Loading chart...</div>
      </div>
    );
  }

  const ChartComponent = chartModule;

  return (
    <div style={{ height }}>
      <ChartComponent
        ref={chartRef}
        data={data}
        options={memoizedOptions}
      />
    </div>
  );
});

OptimizedChart.displayName = 'OptimizedChart';

// Optimized data table with sorting and filtering
export const OptimizedDataTable = memo<{
  data: any[];
  columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
    filterable?: boolean;
    render?: (value: any, row: any) => React.ReactNode;
  }>;
  pageSize?: number;
  searchable?: boolean;
}>(({ data, columns, pageSize = 10, searchable = true }) => {
  usePerformanceMonitor('OptimizedDataTable');

  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  // Memoized filtered and sorted data
  const processedData = useMemo(() => {
    let filtered = data;

    // Apply search filter
    if (filter && searchable) {
      filtered = data.filter(row =>
        Object.values(row).some(value =>
          String(value).toLowerCase().includes(filter.toLowerCase())
        )
      );
    }

    // Apply sorting
    if (sortBy) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];

        if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [data, filter, sortBy, sortOrder, searchable]);

  // Memoized paginated data
  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, currentPage, pageSize]);

  const handleSort = useCallback((columnKey: string) => {
    if (sortBy === columnKey) {
      setSortOrder(order => order === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(columnKey);
      setSortOrder('asc');
    }
  }, [sortBy]);

  const totalPages = Math.ceil(processedData.length / pageSize);

  return (
    <div className="optimized-data-table">
      {searchable && (
        <div className="table-controls">
          <input
            type="text"
            placeholder="Search..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="search-input"
          />
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={column.key}
                onClick={column.sortable ? () => handleSort(column.key) : undefined}
                className={column.sortable ? 'sortable' : ''}
              >
                {column.label}
                {sortBy === column.key && (
                  <span className="sort-indicator">
                    {sortOrder === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((row, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={column.key}>
                  {column.render
                    ? column.render(row[column.key], row)
                    : row[column.key]
                  }
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="table-pagination">
          <button
            onClick={() => setCurrentPage(page => Math.max(0, page - 1))}
            disabled={currentPage === 0}
          >
            Previous
          </button>
          <span>
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(page => Math.min(totalPages - 1, page + 1))}
            disabled={currentPage === totalPages - 1}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
});

OptimizedDataTable.displayName = 'OptimizedDataTable';

// Error boundary for graceful error handling
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error }> },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const monitor = PerformanceMonitor.getInstance();
    monitor.recordMetric({
      name: 'component_error',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      category: 'render',
      tags: {
        error: error.message,
        stack: error.stack?.slice(0, 200) || 'unknown'
      }
    });

    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} />;
    }

    return this.props.children;
  }
}

// Default error fallback component
const DefaultErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div className="error-fallback">
    <h2>Something went wrong</h2>
    <p>{error.message}</p>
    <button onClick={() => window.location.reload()}>
      Reload page
    </button>
  </div>
);

// Performance monitoring wrapper component
export const PerformanceWrapper: React.FC<{
  children: React.ReactNode;
  name: string;
}> = ({ children, name }) => {
  usePerformanceMonitor(name);
  return <>{children}</>;
};

export default {
  OptimizedTimerItem,
  VirtualizedTimerList,
  LazyComponent,
  OptimizedChart,
  OptimizedDataTable,
  ErrorBoundary,
  PerformanceWrapper
};