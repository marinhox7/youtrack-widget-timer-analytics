/**
 * Advanced Timer Analytics Widget
 * Provides comprehensive analytics and insights for timer data
 */

import React, { useState, useEffect, useCallback, useMemo, memo, useRef, useTransition } from 'react';
import { debounce } from 'throttle-debounce';
import { YouTrackAPI, processTimerData, formatDuration } from '../../services/api';
import { TimerEntry } from '../../types';
import { Logger } from '../../services/logger';
import { useVirtualizedData } from '../../hooks/useVirtualizedData';
import { useInfiniteScroll } from '../../hooks/useIntersectionObserver';
import './TimerAnalytics.css';


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

      // Set raw data - filtering will be handled by virtualized hook
      setRawTimers(timers);

      logger.warn('Raw timer data loaded', {
        timerCount: timers.length,
        projects: [...new Set(timers.map(t => t.projectShortName))].length
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

      {/* Quick Analytics Grid - Charts removed for performance */}
      <div className="quick-analytics-grid">
        {/* Status Distribution */}
        <div className="analytics-container">
          <h3>📊 Distribuição por Status</h3>
          <div className="status-breakdown">
            {Object.entries(
              visibleItems.reduce((acc, timer) => {
                acc[timer.status] = (acc[timer.status] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([status, count]) => (
              <div key={status} className={`status-item status-${status}`}>
                <span className="status-label">{status.toUpperCase()}</span>
                <span className="status-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Statistics - Computed from visible items */}
      <div className="live-stats-grid">
        {/* Top Projects */}
        {showProjectBreakdown && (
          <div className="breakdown-container">
            <h3>🏗️ Top Projetos (Filtrados)</h3>
            <div className="breakdown-list">
              {Object.entries(
                visibleItems.reduce((acc, timer) => {
                  const project = timer.projectShortName;
                  if (!acc[project]) {
                    acc[project] = { count: 0, totalTime: 0, users: new Set() };
                  }
                  acc[project].count++;
                  acc[project].totalTime += timer.elapsedMs;
                  acc[project].users.add(timer.username);
                  return acc;
                }, {} as Record<string, { count: number; totalTime: number; users: Set<string> }>)
              )
                .sort(([,a], [,b]) => b.count - a.count)
                .slice(0, 5)
                .map(([project, stats]) => (
                  <div key={project} className="breakdown-item">
                    <div className="breakdown-info">
                      <span className="breakdown-name">{project}</span>
                      <span className="breakdown-detail">{stats.users.size} usuários</span>
                    </div>
                    <div className="breakdown-metrics">
                      <span className="breakdown-count">{stats.count}</span>
                      <span className="breakdown-duration">{formatDuration(stats.totalTime)}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* Top Users */}
        {showUserBreakdown && (
          <div className="breakdown-container">
            <h3>👤 Top Usuários (Filtrados)</h3>
            <div className="breakdown-list">
              {Object.entries(
                visibleItems.reduce((acc, timer) => {
                  const user = timer.username;
                  if (!acc[user]) {
                    acc[user] = { count: 0, totalTime: 0, projects: new Set() };
                  }
                  acc[user].count++;
                  acc[user].totalTime += timer.elapsedMs;
                  acc[user].projects.add(timer.projectShortName);
                  return acc;
                }, {} as Record<string, { count: number; totalTime: number; projects: Set<string> }>)
              )
                .sort(([,a], [,b]) => b.count - a.count)
                .slice(0, 5)
                .map(([user, stats]) => (
                  <div key={user} className="breakdown-item">
                    <div className="breakdown-info">
                      <span className="breakdown-name">{user}</span>
                      <span className="breakdown-detail">{stats.projects.size} projetos</span>
                    </div>
                    <div className="breakdown-metrics">
                      <span className="breakdown-count">{stats.count}</span>
                      <span className="breakdown-duration">{formatDuration(stats.totalTime)}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="analytics-footer">
        <span>Última atualização: {new Date().toLocaleTimeString()}</span>
      </div>

    </div>
  );
});

export default TimerAnalytics;

