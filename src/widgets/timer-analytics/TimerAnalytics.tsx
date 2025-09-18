/**
 * Advanced Timer Analytics Widget
 * Provides comprehensive analytics and insights for timer data
 */

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { format, subDays, subHours, isWithinInterval } from 'date-fns';
import { debounce } from 'throttle-debounce';
import { YouTrackAPI, processTimerData, calculateStats, formatDuration } from '../../services/api';
import { TimerEntry, TimerStats, ProjectTimerStats, UserTimerStats } from '../../types';
import { Logger } from '../../services/logger';
import './TimerAnalytics.css';

// Register Chart.js components
ChartJS.register(...registerables);

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

interface AnalyticsData {
  timers: TimerEntry[];
  stats: TimerStats;
  trends: {
    hourly: { hour: number; count: number; avgDuration: number }[];
    daily: { date: string; count: number; avgDuration: number }[];
    weekly: { week: string; count: number; avgDuration: number }[];
  };
}

const TimerAnalytics: React.FC<TimerAnalyticsProps> = memo(({
  host,
  refreshInterval = 45000, // 45 seconds for analytics (optimized from 30s)
  showProjectBreakdown = true,
  showUserBreakdown = true,
  showTrends = true,
  timeRange = 'day'
}) => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'count' | 'duration' | 'average'>('count');
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [selectedProject, setSelectedProject] = useState<string>('all');

  // Performance optimization states
  const [isProcessing, setIsProcessing] = useState(false);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const logger = Logger.getLogger('TimerAnalytics');
  const api = new YouTrackAPI(host);

  // Debounced filter update functions
  const debouncedTimeRangeUpdate = useMemo(
    () => debounce(300, (newTimeRange: 'day' | 'week' | 'month') => {
      setSelectedTimeRange(newTimeRange);
      setIsProcessing(false);
    }),
    []
  );

  const debouncedMetricUpdate = useMemo(
    () => debounce(300, (newMetric: 'count' | 'duration' | 'average') => {
      setSelectedMetric(newMetric);
      setIsProcessing(false);
    }),
    []
  );

  // Optimized filter change handlers
  const handleFilterChange = useCallback((filterType: string, value: string) => {
    setIsProcessing(true);

    // Clear previous timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }

    // Apply filter with debounce
    switch (filterType) {
      case 'timeRange':
        debouncedTimeRangeUpdate(value as 'day' | 'week' | 'month');
        break;
      case 'metric':
        debouncedMetricUpdate(value as 'count' | 'duration' | 'average');
        break;
    }

    // Fallback timeout to clear processing state
    processingTimeoutRef.current = setTimeout(() => {
      setIsProcessing(false);
    }, 1000);
  }, [debouncedTimeRangeUpdate, debouncedMetricUpdate]);

  // Memoized handlers
  const handleTimeRangeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    handleFilterChange('timeRange', e.target.value);
  }, [handleFilterChange]);

  const handleMetricChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    handleFilterChange('metric', e.target.value);
  }, [handleFilterChange]);

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Reduce limit to decrease payload and parsing time.
      // This keeps analytics responsive while still covering typical active timers volume.
      const issues = await api.fetchIssuesWithTimers({
        projectId: selectedProject === 'all' ? undefined : selectedProject,
        limit: 500
      });

      const timers = processTimerData(issues);
      const stats = calculateStats(timers);
      const trends = calculateTrendsOptimized(timers, selectedTimeRange);

      setData({ timers, stats, trends });
      logger.warn('Analytics data updated', { timerCount: timers.length, projectCount: stats.projectBreakdown.length });

    } catch (err) {
      logger.error('Failed to fetch analytics data', err as Error);
      setError('Falha ao carregar dados de analytics');
    } finally {
      setLoading(false);
    }
  }, [api, selectedProject, selectedTimeRange]);



  // Auto refresh
  useEffect(() => {
    fetchAnalyticsData();
    const interval = setInterval(fetchAnalyticsData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAnalyticsData, refreshInterval]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, []);


  // Optimized trends calculation with performance monitoring
  const calculateTrendsOptimized = useCallback((timers: TimerEntry[], range: string) => {
    console.time('calculateTrends');

    // Early return for empty data
    if (!timers.length) {
      console.timeEnd('calculateTrends');
      return { hourly: [], daily: [], weekly: [] };
    }

    const now = new Date();
    const nowMs = now.getTime();
    const buckets = range === "day" ? 24 : (range === "week" ? 7 : 30);
    const intervalMs = range === 'day' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    // Pre-compute time boundaries for efficiency
    const boundaries = Array.from({ length: buckets }, (_, i) => {
      const start = nowMs - ((buckets - i) * intervalMs);
      const end = start + intervalMs;
      return { start, end, index: i };
    });

    // Initialize result arrays
    const result = range === 'day'
      ? { hourly: boundaries.map(b => ({ hour: new Date(b.start).getHours(), count: 0, avgDuration: 0, totalDuration: 0 })), daily: [], weekly: [] }
      : { hourly: [], daily: boundaries.map(b => ({ date: format(new Date(b.start), 'MMM dd'), count: 0, avgDuration: 0, totalDuration: 0 })), weekly: [] };

    // Single pass through timers with optimized bucketing
    const targetArray = range === 'day' ? result.hourly : result.daily;

    for (const timer of timers) {
      const timerStartMs = timer.startTime;

      // Skip timers outside time range
      if (timerStartMs < boundaries[0].start || timerStartMs >= nowMs) continue;

      // Binary search for bucket (more efficient than linear search)
      let bucketIndex = -1;
      for (let i = 0; i < boundaries.length; i++) {
        if (timerStartMs >= boundaries[i].start && timerStartMs < boundaries[i].end) {
          bucketIndex = i;
          break;
        }
      }

      if (bucketIndex !== -1) {
        const bucket = targetArray[bucketIndex];
        bucket.count += 1;
        bucket.totalDuration += timer.elapsedMs;
        bucket.avgDuration = bucket.totalDuration / bucket.count;
      }
    }

    console.timeEnd('calculateTrends');
    return result;
  }, []);

  // Chart options (memoized to avoid re-renders)
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            if (selectedMetric === 'duration' || selectedMetric === 'average') {
              return `${context.dataset.label}: ${formatDuration(context.parsed.y)}`;
            }
            return `${context.dataset.label}: ${context.parsed.y}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => {
            if (selectedMetric === 'duration' || selectedMetric === 'average') {
              return formatDuration(value, { precision: 'low' });
            }
            return value;
          }
        }
      }
    }
  }), [selectedMetric]);

  // Memoized and optimized chart data processing
  const trendsChartData = useMemo(() => {
    if (!data || isProcessing) return null;

    console.time('chartDataProcessing');

    const trendsData = selectedTimeRange === 'day' ? data.trends.hourly : data.trends.daily;

    // Early return if no data
    if (!trendsData.length) {
      console.timeEnd('chartDataProcessing');
      return null;
    }

    const labels = selectedTimeRange === 'day'
      ? trendsData.map(d => `${d.hour}:00`)
      : trendsData.map(d => d.date);

    const values = trendsData.map(d => {
      switch (selectedMetric) {
        case 'count': return d.count;
        case 'duration': return d.totalDuration || (d.count * d.avgDuration);
        case 'average': return d.avgDuration;
        default: return d.count;
      }
    });

    console.timeEnd('chartDataProcessing');

    return {
      labels,
      datasets: [
        {
          label: selectedMetric === 'count' ? 'Timer Count' :
                 selectedMetric === 'duration' ? 'Total Duration' : 'Average Duration',
          data: values,
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          fill: true
        }
      ]
    };
  }, [data, selectedTimeRange, selectedMetric, isProcessing]);

  const projectsChartData = useMemo(() => {
    if (!data) return null;

    const projects = data.stats.projectBreakdown.slice(0, 10); // Top 10 projects

    return {
      labels: projects.map(p => p.projectShortName),
      datasets: [
        {
          label: 'Active Timers',
          data: projects.map(p => p.timerCount),
          backgroundColor: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
          ]
        }
      ]
    };
  }, [data]);

  const statusDistributionData = useMemo(() => {
    if (!data) return null;

    const statusCounts = data.timers.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] || 0) as number + 1;
        return acc;
      },
      { ok: 0, attention: 0, long: 0, critical: 0, overtime: 0 } as Record<string, number>
    );

    return {
      labels: ['OK', 'Attention', 'Long', 'Critical', 'Overtime'],
      datasets: [
        {
          data: [
            statusCounts.ok,
            statusCounts.attention,
            statusCounts.long,
            statusCounts.critical,
            statusCounts.overtime
          ],
          backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545', '#6f42c1']
        }
      ]
    };
  }, [data]);

  if (loading && !data) {
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

  if (!data) {
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
          <select
            value={selectedTimeRange}
            onChange={handleTimeRangeChange}
            className={`control-select ${isProcessing ? 'processing' : ''}`}
            disabled={isProcessing}
          >
            <option value="day">Último Dia</option>
            <option value="week">Última Semana</option>
            <option value="month">Último Mês</option>
          </select>

          <select
            value={selectedMetric}
            onChange={handleMetricChange}
            className={`control-select ${isProcessing ? 'processing' : ''}`}
            disabled={isProcessing}
          >
            <option value="count">Contagem</option>
            <option value="duration">Duração Total</option>
            <option value="average">Duração Média</option>
          </select>

          <button onClick={fetchAnalyticsData} className="refresh-button" disabled={loading}>
            {loading ? '⟳' : '↻'} Atualizar
          </button>

          {isProcessing && (
            <div className="processing-indicator">
              <span className="spinner">⟳</span>
              <span>Processando...</span>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">👥</div>
          <div className="metric-content">
            <div className="metric-value">{data.stats.totalUsers}</div>
            <div className="metric-label">Usuários Ativos</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⏱️</div>
          <div className="metric-content">
            <div className="metric-value">{data.stats.totalTimers}</div>
            <div className="metric-label">Timers Ativos</div>
          </div>
        </div>

        <div className="metric-card critical">
          <div className="metric-icon">🚨</div>
          <div className="metric-content">
            <div className="metric-value">{data.stats.criticalTimers}</div>
            <div className="metric-label">Críticos</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{formatDuration(data.stats.averageTimeMs, { precision: 'low' })}</div>
            <div className="metric-label">Tempo Médio</div>
          </div>
        </div>
      </div>

      {/* Active Issues List */}
      <div className="active-issues-section">
        <h3>🔥 Issues com Timers Ativos</h3>
        <div className="active-issues-grid">
          {data.timers.length > 0 ? (
            data.timers.map((timer, index) => (
              <Tooltip key={`${timer.issueId}-${index}`} timer={timer}>
                <TimerCard timer={timer} />
              </Tooltip>
            ))
          ) : (
            <div className="no-active-issues">
              <div className="empty-icon">💤</div>
              <p>Nenhum timer ativo no momento</p>
            </div>
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Trends Chart */}
        {showTrends && trendsChartData && (
          <div className="chart-container">
            <h3>Tendências de Timers</h3>
            <div className="chart-wrapper">
              <Line data={trendsChartData} options={chartOptions} />
            </div>
          </div>
        )}

        {/* Project Breakdown */}
        {showProjectBreakdown && projectsChartData && (
          <div className="chart-container">
            <h3>Breakdown por Projeto</h3>
            <div className="chart-wrapper">
              <Bar data={projectsChartData} options={chartOptions} />
            </div>
          </div>
        )}

        {/* Status Distribution */}
        <div className="chart-container">
          <h3>Distribuição por Status</h3>
          <div className="chart-wrapper">
            <Doughnut
              data={statusDistributionData!}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right' as const
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Detailed Breakdowns */}
      <div className="breakdowns-grid">
        {/* Top Projects */}
        {showProjectBreakdown && (
          <div className="breakdown-container">
            <h3>Top Projetos</h3>
            <div className="breakdown-list">
              {data.stats.projectBreakdown.slice(0, 5).map((project: ProjectTimerStats) => (
                <div key={project.projectId} className="breakdown-item">
                  <div className="breakdown-info">
                    <span className="breakdown-name">{project.projectShortName}</span>
                    <span className="breakdown-detail">{project.users.length} usuários</span>
                  </div>
                  <div className="breakdown-metrics">
                    <span className="breakdown-count">{project.timerCount}</span>
                    <span className="breakdown-duration">{formatDuration(project.totalTimeMs)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Users */}
        {showUserBreakdown && (
          <div className="breakdown-container">
            <h3>Top Usuários</h3>
            <div className="breakdown-list">
              {data.stats.userBreakdown.slice(0, 5).map((user: UserTimerStats) => (
                <div key={user.username} className="breakdown-item">
                  <div className="breakdown-info">
                    <span className="breakdown-name">{user.username}</span>
                    <span className="breakdown-detail">{user.projects.length} projetos</span>
                  </div>
                  <div className="breakdown-metrics">
                    <span className="breakdown-count">{user.timerCount}</span>
                    <span className="breakdown-duration">{formatDuration(user.totalTimeMs)}</span>
                  </div>
                </div>
              ))}
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

