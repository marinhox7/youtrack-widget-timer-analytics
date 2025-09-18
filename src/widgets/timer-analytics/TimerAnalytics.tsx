/**
 * Advanced Timer Analytics Widget
 * Provides comprehensive analytics and insights for timer data
 */

import React, { useState, useEffect, useCallback, useMemo, memo, useRef, useTransition } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { debounce } from 'throttle-debounce';
import { YouTrackAPI, processTimerData, calculateStats, formatDuration } from '../../services/api';
import { TimerEntry, TimerStats, ProjectTimerStats, UserTimerStats } from '../../types';
import { Logger } from '../../services/logger';
import { useVirtualizedData } from '../../hooks/useVirtualizedData';
import { useInfiniteScroll } from '../../hooks/useIntersectionObserver';
import './TimerAnalytics.css';

// Register Chart.js components
ChartJS.register(...registerables);

// Analytics Data Interface
interface AnalyticsData {
  timers: TimerEntry[];
  stats: TimerStats;
  trends: {
    hourly: { hour: number; count: number; avgDuration: number }[];
    daily: { date: string; count: number; avgDuration: number }[];
    weekly: { week: string; count: number; avgDuration: number }[];
  };
}

// Memoized Timer Card Component with clickable links
const TimerCard = memo(({ timer }: { timer: TimerEntry }) => {
  const handleIssueClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(timer.issueUrl, '_blank', 'noopener,noreferrer');
  }, [timer.issueUrl]);

  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(timer.issueUrl, '_blank', 'noopener,noreferrer');
  }, [timer.issueUrl]);

  return (
    <div className="active-issue-card">
      <div className="issue-content">
        <div className="issue-header">
          <a
            href={timer.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="issue-link clickable"
            onClick={handleIssueClick}
            title={`Abrir ${timer.issueKey} em nova aba`}
          >
            {timer.issueKey}
          </a>
          <span className={`project-badge project-${timer.projectShortName.toLowerCase()}`}>
            {timer.projectShortName}
          </span>
        </div>
        <div
          className="issue-title clickable-title"
          onClick={handleTitleClick}
          title={`Clique para abrir: ${timer.issueSummary}`}
        >
          {timer.issueSummary}
        </div>
        <div className="issue-meta">
          <span className="timer-duration">⏱️ {formatDuration(timer.elapsedMs, { precision: 'medium' })}</span>
          <span className="timer-user">👤 {timer.username}</span>
        </div>
        <div className="issue-status">
          <span className={`status-badge ${timer.status}`}>
            {timer.status === 'ok' && '✅ OK'}
            {timer.status === 'attention' && '⚠️ Atenção'}
            {timer.status === 'long' && '🟡 Longo'}
            {timer.status === 'critical' && '🟠 Crítico'}
            {timer.status === 'overtime' && '🔴 Overtime'}
          </span>
        </div>
      </div>
    </div>
  );
});

TimerCard.displayName = 'TimerCard';

// Ultra-fast select component with instant feedback
const FastSelect = memo<{
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  loading?: boolean;
  disabled?: boolean;
}>(({ value, onChange, options, loading = false, disabled = false }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`control-select ${loading ? 'processing' : ''}`}
    disabled={disabled || loading}
  >
    {options.map(option => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
));

FastSelect.displayName = 'FastSelect';

// Skeleton loader for instant feedback
const SkeletonLoader = memo(() => (
  <div className="skeleton-container">
    {Array.from({ length: 8 }, (_, i) => (
      <div key={i} className="skeleton-card">
        <div className="skeleton-line skeleton-title"></div>
        <div className="skeleton-line skeleton-subtitle"></div>
        <div className="skeleton-line skeleton-duration"></div>
      </div>
    ))}
  </div>
));

SkeletonLoader.displayName = 'SkeletonLoader';

// Progress indicator
const ProgressIndicator = memo<{ progress: number; isVisible: boolean }>(
  ({ progress, isVisible }) => {
    if (!isVisible) return null;

    return (
      <div className="progress-container">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <span className="progress-text">
          Processando... {Math.round(progress)}%
        </span>
      </div>
    );
  }
);

ProgressIndicator.displayName = 'ProgressIndicator';

// Virtualized list component
const VirtualizedTimerList = memo<{
  items: TimerEntry[];
  totalCount: number;
  onLoadMore: () => void;
  loading: boolean;
}>(({ items, totalCount, onLoadMore, loading }) => {
  const loadMoreRef = useInfiniteScroll(onLoadMore, {
    enabled: !loading && items.length < totalCount
  }) as React.RefObject<HTMLDivElement>;

  return (
    <div className="virtualized-timer-list">
      <div className="timer-grid-optimized">
        {items.map((timer, index) => (
          <Tooltip key={`${timer.issueId}-${timer.username}-${index}`} timer={timer}>
            <TimerCard timer={timer} />
          </Tooltip>
        ))}
      </div>

      {loading && <SkeletonLoader />}

      {items.length < totalCount && !loading && (
        <div ref={loadMoreRef} className="load-more-trigger">
          <button onClick={onLoadMore} className="load-more-btn">
            Carregar mais ({totalCount - items.length} restantes)
          </button>
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="empty-state-optimized">
          <div className="empty-icon">🔍</div>
          <p>Nenhum timer encontrado com os filtros atuais</p>
        </div>
      )}
    </div>
  );
});

VirtualizedTimerList.displayName = 'VirtualizedTimerList';

// Tooltip Component
const Tooltip = memo(({ timer, children }: { timer: TimerEntry; children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);

  const showTooltip = useCallback(() => setIsVisible(true), []);
  const hideTooltip = useCallback(() => setIsVisible(false), []);

  return (
    <div
      className="tooltip-container"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {isVisible && (
        <div className="tooltip-content">
          <div className="tooltip-header">
            <strong>{timer.issueKey}</strong>
            <span className={`status-badge ${timer.status}`}>
              {timer.status.toUpperCase()}
            </span>
          </div>
          <div className="tooltip-body">
            <p><strong>Usuário:</strong> {timer.username}</p>
            <p><strong>Iniciado:</strong> {new Date(timer.startTime).toLocaleString('pt-BR')}</p>
            <p><strong>Duração:</strong> {formatDuration(timer.elapsedMs)}</p>
            <p><strong>Projeto:</strong> {timer.projectName}</p>
            <p><strong>Issue:</strong> {timer.issueSummary}</p>
            {timer.assignees && timer.assignees.length > 0 && (
              <p><strong>Atribuído:</strong> {timer.assignees.join(', ')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

Tooltip.displayName = 'Tooltip';

interface TimerAnalyticsProps {
  host?: any;
  refreshInterval?: number;
  showProjectBreakdown?: boolean;
  showUserBreakdown?: boolean;
  showTrends?: boolean;
  timeRange?: 'day' | 'week' | 'month';
}


const TimerAnalytics: React.FC<TimerAnalyticsProps> = memo(({
  host,
  refreshInterval = 45000, // 45 seconds for analytics (optimized from 30s)
  showProjectBreakdown = true,
  showUserBreakdown = true,
  showTrends = true,
  timeRange = 'day'
}) => {
  // Raw data state
  const [rawTimers, setRawTimers] = useState<TimerEntry[]>([]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedFilters, setSelectedFilters] = useState({
    timeRange: timeRange,
    metric: 'count' as 'count' | 'duration' | 'average',
    project: 'all',
    status: 'all',
    user: 'all'
  });

  // React 18 concurrent features for smooth UI
  const [isPending, startTransition] = useTransition();
  const filterTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const logger = Logger.getLogger('TimerAnalytics');
  const api = new YouTrackAPI(host);

  // High-performance filter function
  const filterFunction = useCallback((timer: TimerEntry, filter: any) => {
    if (!filter) return true;

    // Project filter
    if (filter.project && filter.project !== 'all' && timer.projectShortName !== filter.project) {
      return false;
    }

    // Status filter
    if (filter.status && filter.status !== 'all' && timer.status !== filter.status) {
      return false;
    }

    // User filter
    if (filter.user && filter.user !== 'all' && timer.username !== filter.user) {
      return false;
    }

    // Time range filter (based on duration)
    if (filter.timeRange && filter.timeRange !== 'day') {
      const hours = timer.elapsedMs / (60 * 60 * 1000);
      switch (filter.timeRange) {
        case 'short':
          if (hours >= 2) return false;
          break;
        case 'medium':
          if (hours < 2 || hours >= 8) return false;
          break;
        case 'long':
          if (hours < 8) return false;
          break;
      }
    }

    return true;
  }, []);

  // Virtualized data hook with Web Worker support
  const {
    visibleItems,
    totalCount,
    isLoading: isProcessing,
    progress,
    loadMore,
    filterItems,
    sortItems,
    scrollToTop
  } = useVirtualizedData<TimerEntry>(
    rawTimers,
    filterFunction,
    {
      chunkSize: 50,
      initialChunkSize: 25,
      enableWorker: true
    }
  );

  // INSTANT filter response with minimal debounce
  const handleFilterChange = useCallback((filterType: string, value: string) => {
    // Clear previous timeout
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }

    // Update UI state immediately (optimistic update)
    const newFilters = { ...selectedFilters, [filterType]: value };
    setSelectedFilters(newFilters);

    // Debounce the actual filtering with reduced delay
    filterTimeoutRef.current = setTimeout(() => {
      startTransition(() => {
        filterItems(newFilters);
      });
    }, 150); // Reduced from 300ms to 150ms
  }, [selectedFilters, filterItems, startTransition]);

  // Calculate trends data for charts
  const calculateTrends = useCallback((timers: TimerEntry[]) => {
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    // Hourly trends for last 24 hours
    const hourly = Array.from({ length: 24 }, (_, i) => {
      const hour = (now.getHours() - i + 24) % 24;
      const hourTimers = timers.filter(t => {
        const timerHour = new Date(t.startTime).getHours();
        return timerHour === hour;
      });
      return {
        hour,
        count: hourTimers.length,
        avgDuration: hourTimers.length > 0 ? hourTimers.reduce((sum, t) => sum + t.elapsedMs, 0) / hourTimers.length : 0
      };
    }).reverse();

    // Daily trends for last 7 days
    const daily = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now.getTime() - i * oneDay);
      const dateStr = date.toISOString().split('T')[0];
      const dayTimers = timers.filter(t => {
        const timerDate = new Date(t.startTime).toISOString().split('T')[0];
        return timerDate === dateStr;
      });
      return {
        date: dateStr,
        count: dayTimers.length,
        avgDuration: dayTimers.length > 0 ? dayTimers.reduce((sum, t) => sum + t.elapsedMs, 0) / dayTimers.length : 0
      };
    }).reverse();

    // Weekly trends for last 4 weeks
    const weekly = Array.from({ length: 4 }, (_, i) => {
      const weekStart = new Date(now.getTime() - i * 7 * oneDay);
      const weekEnd = new Date(weekStart.getTime() + 7 * oneDay);
      const weekStr = `Week ${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      const weekTimers = timers.filter(t => {
        const timerDate = new Date(t.startTime);
        return timerDate >= weekStart && timerDate < weekEnd;
      });
      return {
        week: weekStr,
        count: weekTimers.length,
        avgDuration: weekTimers.length > 0 ? weekTimers.reduce((sum, t) => sum + t.elapsedMs, 0) / weekTimers.length : 0
      };
    }).reverse();

    return { hourly, daily, weekly };
  }, []);

  // Optimized handlers with instant UI feedback
  const handleTimeRangeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    handleFilterChange('timeRange', e.target.value);
  }, [handleFilterChange]);

  const handleMetricChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    handleFilterChange('metric', e.target.value);
  }, [handleFilterChange]);

  const handleProjectChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    handleFilterChange('project', e.target.value);
  }, [handleFilterChange]);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    handleFilterChange('status', e.target.value);
  }, [handleFilterChange]);

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch raw data without immediate filtering
      const issues = await api.fetchIssuesWithTimers({
        projectId: selectedFilters.project === 'all' ? undefined : selectedFilters.project,
        limit: 1000 // Increased limit since we're virtualizing
      });

      const timers = processTimerData(issues);

      // Calculate analytics data
      const stats = calculateStats(timers);
      const trends = calculateTrends(timers);

      const analyticsData: AnalyticsData = {
        timers,
        stats,
        trends
      };

      // Set both raw data and calculated analytics
      setRawTimers(timers);
      setData(analyticsData);

      logger.warn('Analytics data loaded', {
        timerCount: timers.length,
        projects: [...new Set(timers.map(t => t.projectShortName))].length,
        users: stats.totalUsers
      });

    } catch (err) {
      logger.error('Failed to fetch analytics data', err as Error);
      setError('Falha ao carregar dados de analytics');
    } finally {
      setLoading(false);
    }
  }, [api, selectedFilters.project]);



  // Auto refresh
  useEffect(() => {
    fetchAnalyticsData();
    const interval = setInterval(fetchAnalyticsData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAnalyticsData, refreshInterval]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, []);


  // Quick stats calculation from visible items
  const quickStats = useMemo(() => {
    const totalUsers = new Set(visibleItems.map(t => t.username)).size;
    const totalTimers = visibleItems.length;
    const criticalTimers = visibleItems.filter(t => t.status === 'critical').length;
    const totalTime = visibleItems.reduce((sum, t) => sum + t.elapsedMs, 0);
    const averageTime = totalTimers > 0 ? totalTime / totalTimers : 0;

    return {
      totalUsers,
      totalTimers,
      criticalTimers,
      averageTime
    };
  }, [visibleItems]);

  // Trends Chart Data
  const trendsChartData = useMemo(() => {
    if (!data?.trends) return null;

    const trendsData = selectedFilters.timeRange === 'day' ? data.trends.hourly :
                       selectedFilters.timeRange === 'week' ? data.trends.daily :
                       data.trends.weekly;

    const labels = selectedFilters.timeRange === 'day'
      ? trendsData.map((d: any) => `${d.hour}:00`)
      : trendsData.map((d: any) => d.date || d.week);

    const values = trendsData.map((d: any) => {
      switch (selectedFilters.metric) {
        case 'count': return d.count;
        case 'duration': return d.count * d.avgDuration / (1000 * 60); // Convert to minutes
        case 'average': return d.avgDuration / (1000 * 60); // Convert to minutes
        default: return d.count;
      }
    });

    return {
      labels,
      datasets: [
        {
          label: selectedFilters.metric === 'count' ? 'Timer Count' :
                 selectedFilters.metric === 'duration' ? 'Total Duration (min)' : 'Average Duration (min)',
          data: values,
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }
      ]
    };
  }, [data, selectedFilters.timeRange, selectedFilters.metric]);

  // Projects Chart Data
  const projectsChartData = useMemo(() => {
    if (!data?.stats?.projectBreakdown) return null;

    const projects = data.stats.projectBreakdown.slice(0, 10);

    return {
      labels: projects.map(p => p.projectShortName),
      datasets: [
        {
          label: 'Timers Ativos',
          data: projects.map(p => p.timerCount),
          backgroundColor: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
          ],
          borderWidth: 1
        }
      ]
    };
  }, [data]);

  // Status Distribution Data
  const statusDistributionData = useMemo(() => {
    if (!data?.timers) return {
      labels: ['OK', 'Attention', 'Long', 'Critical', 'Overtime'],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545', '#6f42c1']
      }]
    };

    const statusCounts = {
      ok: data.timers.filter(t => t.status === 'ok').length,
      attention: data.timers.filter(t => t.status === 'attention').length,
      long: data.timers.filter(t => t.status === 'long').length,
      critical: data.timers.filter(t => t.status === 'critical').length,
      overtime: data.timers.filter(t => t.status === 'overtime').length
    };

    return {
      labels: ['OK', 'Atenção', 'Longo', 'Crítico', 'Extra'],
      datasets: [
        {
          data: Object.values(statusCounts),
          backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545', '#6f42c1'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }
      ]
    };
  }, [data]);

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  if (loading) {
    return (
      <div className="widget-container timer-analytics">
        <div className="analytics-header">
          <h2>📊 Timer Analytics</h2>
          <div className="header-controls">
            <span className="loading-text">Carregando...</span>
          </div>
        </div>
        <div className="loading-container">
          <div className="loader"></div>
          <span>Carregando dados de analytics...</span>
          <small>Isso pode levar alguns segundos</small>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="widget-container timer-analytics">
        <div className="analytics-header">
          <h2>📊 Timer Analytics</h2>
          <div className="header-controls">
            <button onClick={fetchAnalyticsData} className="refresh-button">
              ↻ Tentar Novamente
            </button>
          </div>
        </div>
        <div className="error-container">
          <span className="error-icon">⚠️</span>
          <div className="error-content">
            <h3>Erro ao Carregar Analytics</h3>
            <p>{error}</p>
            <button onClick={fetchAnalyticsData} className="retry-button">
              🔄 Tentar Novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (rawTimers.length === 0 && !loading) {
    return (
      <div className="widget-container timer-analytics">
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          <span>Nenhum dado de analytics disponível</span>
        </div>
      </div>
    );
  }

  return (
    <div className="widget-container timer-analytics">
      {/* Header */}
      <div className="analytics-header">
        <div className="header-title">
          <h2>📊 Timer Analytics</h2>
        </div>
        <div className="header-filters">
          <FastSelect
            value={selectedFilters.timeRange}
            onChange={(value) => handleTimeRangeChange({ target: { value } } as any)}
            options={[
              { value: 'day', label: 'Último Dia' },
              { value: 'week', label: 'Última Semana' },
              { value: 'month', label: 'Último Mês' },
              { value: 'short', label: 'Timers Curtos (<2h)' },
              { value: 'medium', label: 'Timers Médios (2-8h)' },
              { value: 'long', label: 'Timers Longos (>8h)' }
            ]}
            loading={isPending || isProcessing}
          />

          <FastSelect
            value={selectedFilters.metric}
            onChange={(value) => handleMetricChange({ target: { value } } as any)}
            options={[
              { value: 'count', label: 'Contagem' },
              { value: 'duration', label: 'Duração Total' },
              { value: 'average', label: 'Duração Média' }
            ]}
            loading={isPending || isProcessing}
          />

          <FastSelect
            value={selectedFilters.status}
            onChange={(value) => handleStatusChange({ target: { value } } as any)}
            options={[
              { value: 'all', label: 'Todos Status' },
              { value: 'ok', label: 'OK' },
              { value: 'attention', label: 'Atenção' },
              { value: 'long', label: 'Longo' },
              { value: 'critical', label: 'Crítico' },
              { value: 'overtime', label: 'Overtime' }
            ]}
            loading={isPending || isProcessing}
          />

          <button onClick={fetchAnalyticsData} className="refresh-button" disabled={loading}>
            {loading ? '⟳' : '↻'} Atualizar
          </button>

          <ProgressIndicator progress={progress} isVisible={isProcessing && progress > 0} />

          {(isPending || isProcessing) && (
            <div className="processing-indicator">
              <span className="spinner">⟳</span>
              <span>
                {isProcessing
                  ? `Filtrando ${totalCount} timers...`
                  : 'Processando...'
                }
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">👥</div>
          <div className="metric-content">
            <div className="metric-value">{quickStats.totalUsers}</div>
            <div className="metric-label">Usuários Ativos</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⏱️</div>
          <div className="metric-content">
            <div className="metric-value">{quickStats.totalTimers}</div>
            <div className="metric-label">Timers Ativos</div>
          </div>
        </div>

        <div className="metric-card critical">
          <div className="metric-icon">🚨</div>
          <div className="metric-content">
            <div className="metric-value">{quickStats.criticalTimers}</div>
            <div className="metric-label">Críticos</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{formatDuration(quickStats.averageTime, { precision: 'low' })}</div>
            <div className="metric-label">Tempo Médio</div>
          </div>
        </div>
      </div>

      {/* Virtualized Timer List */}
      <div className="active-issues-section">
        <div className="section-header">
          <h3>🔥 Issues com Timers Ativos</h3>
          <div className="results-summary">
            {isProcessing ? (
              <span>Processando...</span>
            ) : (
              <span>
                Mostrando {visibleItems.length} de {totalCount} timers
                {totalCount !== rawTimers.length && ` (${rawTimers.length} total carregados)`}
              </span>
            )}
          </div>
        </div>

        <VirtualizedTimerList
          items={visibleItems}
          totalCount={totalCount}
          onLoadMore={loadMore}
          loading={isProcessing}
        />
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Trends Chart */}
        {showTrends && trendsChartData && (
          <div className="chart-container">
            <h3>📈 Tendências de Timers</h3>
            <div className="chart-wrapper">
              <Line
                data={trendsChartData}
                options={chartOptions}
              />
            </div>
          </div>
        )}

        {/* Project Breakdown Chart */}
        {showProjectBreakdown && projectsChartData && (
          <div className="chart-container">
            <h3>📊 Breakdown por Projeto</h3>
            <div className="chart-wrapper">
              <Bar
                data={projectsChartData}
                options={{
                  ...chartOptions,
                  plugins: {
                    legend: {
                      display: false
                    }
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Status Distribution Chart */}
        <div className="chart-container">
          <h3>🎯 Distribuição por Status</h3>
          <div className="chart-wrapper">
            <Doughnut
              data={statusDistributionData!}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right' as const,
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Breakdowns Grid */}
      <div className="breakdowns-grid">
        {/* Project Breakdown */}
        {showProjectBreakdown && data?.stats?.projectBreakdown && (
          <div className="breakdown-container">
            <h3>📁 Top Projetos</h3>
            <div className="breakdown-list">
              {data.stats.projectBreakdown.slice(0, 8).map((project, index) => (
                <div key={project.projectShortName} className="breakdown-item">
                  <div className="breakdown-info">
                    <div className="breakdown-name">{project.projectShortName}</div>
                    <div className="breakdown-detail">{project.timerCount} timers ativos</div>
                  </div>
                  <div className="breakdown-metrics">
                    <div className="breakdown-count">{project.timerCount}</div>
                    <div className="breakdown-duration">
                      {formatDuration(project.totalTimeMs)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Breakdown */}
        {showUserBreakdown && data?.stats?.userBreakdown && (
          <div className="breakdown-container">
            <h3>👥 Top Usuários</h3>
            <div className="breakdown-list">
              {data.stats.userBreakdown.slice(0, 8).map((user, index) => (
                <div key={user.username} className="breakdown-item">
                  <div className="breakdown-info">
                    <div className="breakdown-name">{user.username}</div>
                    <div className="breakdown-detail">{user.timerCount} timers ativos</div>
                  </div>
                  <div className="breakdown-metrics">
                    <div className="breakdown-count">{user.timerCount}</div>
                    <div className="breakdown-duration">
                      {formatDuration(user.totalTimeMs)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="analytics-footer">
        <div>
          Última atualização: {new Date().toLocaleTimeString()}
        </div>
        <div>
          {data ? `${data.timers.length} timers ativos • ${data.stats.totalUsers} usuários` : 'Carregando...'}
        </div>
      </div>

    </div>
  );
});

export default TimerAnalytics;

