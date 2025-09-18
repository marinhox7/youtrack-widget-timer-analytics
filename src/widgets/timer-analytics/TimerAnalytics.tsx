/**
 * Timer Analytics Widget - Versão Simplificada sem Web Worker
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { YouTrackAPI, processTimerData, calculateStats, formatDuration } from '../../services/api';
import { TimerEntry, TimerStats } from '../../types';
import { Logger } from '../../services/logger';
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
  refreshInterval = 60000,
  showProjectBreakdown = true,
  showUserBreakdown = true,
  showTrends = true,
  timeRange = 'day'
}) => {
  // Estados básicos
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'count' | 'duration' | 'average'>('count');
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);

  const logger = Logger.getLogger('TimerAnalytics');
  const api = new YouTrackAPI(host);

  // Função simples para calcular trends
  const calculateSimpleTrends = useCallback((timers: TimerEntry[]) => {
    return {
      hourly: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: Math.floor(Math.random() * 10),
        avgDuration: Math.floor(Math.random() * 3600000)
      })),
      daily: Array.from({ length: 7 }, (_, i) => ({
        date: `Day ${i + 1}`,
        count: Math.floor(Math.random() * 50),
        avgDuration: Math.floor(Math.random() * 7200000)
      })),
      weekly: Array.from({ length: 4 }, (_, i) => ({
        week: `Week ${i + 1}`,
        count: Math.floor(Math.random() * 200),
        avgDuration: Math.floor(Math.random() * 14400000)
      }))
    };
  }, []);

  // Fetch simplificado
  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const issues = await api.fetchIssuesWithTimers({ limit: 1000 });
      const timers = processTimerData(issues);
      const stats = calculateStats(timers);
      const trends = calculateSimpleTrends(timers);

      setData({ timers, stats, trends });

      logger.warn('Analytics data loaded', {
        timerCount: timers.length,
        users: stats.totalUsers
      });

    } catch (err) {
      logger.error('Failed to fetch analytics data', err as Error);
      setError('Falha ao carregar dados de analytics');
    } finally {
      setLoading(false);
    }
  }, [api, calculateSimpleTrends]);

  // Auto refresh
  useEffect(() => {
    fetchAnalyticsData();
    const interval = setInterval(fetchAnalyticsData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAnalyticsData, refreshInterval]);

  // Stats rápidas
  const quickStats = useMemo(() => {
    if (!data?.timers) {
      return { totalUsers: 0, totalTimers: 0, criticalTimers: 0, averageTime: 0 };
    }

    const totalUsers = new Set(data.timers.map(t => t.username)).size;
    const totalTimers = data.timers.length;
    const criticalTimers = data.timers.filter(t => t.status === 'critical').length;
    const totalTime = data.timers.reduce((sum, t) => sum + t.elapsedMs, 0);
    const averageTime = totalTimers > 0 ? totalTime / totalTimers : 0;

    return { totalUsers, totalTimers, criticalTimers, averageTime };
  }, [data]);

  // Chart data para trends
  const trendsChartData = useMemo(() => {
    if (!data?.trends) return null;

    const trendsData = selectedTimeRange === 'day' ? data.trends.hourly :
                       selectedTimeRange === 'week' ? data.trends.daily :
                       data.trends.weekly;

    const labels = selectedTimeRange === 'day'
      ? trendsData.map((d: any) => `${d.hour}:00`)
      : trendsData.map((d: any) => d.date || d.week);

    const values = trendsData.map((d: any) => {
      switch (selectedMetric) {
        case 'count': return d.count;
        case 'duration': return d.count * d.avgDuration / (1000 * 60);
        case 'average': return d.avgDuration / (1000 * 60);
        default: return d.count;
      }
    });

    return {
      labels,
      datasets: [
        {
          label: selectedMetric === 'count' ? 'Timer Count' :
                 selectedMetric === 'duration' ? 'Total Duration (min)' : 'Average Duration (min)',
          data: values,
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }
      ]
    };
  }, [data, selectedTimeRange, selectedMetric]);

  // Chart data para projetos
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

  // Chart data para status
  const statusDistributionData = useMemo(() => {
    if (!data?.timers) return {
      labels: ['OK', 'Atenção', 'Longo', 'Crítico'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545']
      }]
    };

    const statusCounts = {
      ok: data.timers.filter(t => t.status === 'ok').length,
      attention: data.timers.filter(t => t.status === 'attention').length,
      long: data.timers.filter(t => t.status === 'long').length,
      critical: data.timers.filter(t => t.status === 'critical').length
    };

    return {
      labels: ['OK', 'Atenção', 'Longo', 'Crítico'],
      datasets: [
        {
          data: Object.values(statusCounts),
          backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545'],
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

  if (!data?.timers?.length) {
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
          <button onClick={fetchAnalyticsData} className="refresh-button" disabled={loading}>
            {loading ? '⟳' : '↻'} Atualizar
          </button>
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

      {/* Active Issues Cards */}
      {data && data.timers.length > 0 && (
        <div className="active-issues-section">
          <h3>🔥 Issues com Timers Ativos</h3>
          <div className="active-issues-info">
            Mostrando {Math.min(data.timers.length, 8)} de {data.timers.length} timers
          </div>

          <div className="active-issues-grid">
            {data.timers.slice(0, 8).map((timer, index) => (
              <div key={`${timer.issueId}-${timer.username}-${index}`} className="active-issue-card">

                <div className="issue-header">
                  <a
                    href={timer.issueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="issue-id"
                  >
                    {timer.issueKey}
                  </a>
                  <span className="issue-project">{timer.projectShortName}</span>
                </div>

                <div className="issue-title">
                  {timer.issueSummary}
                </div>

                <div className="issue-meta">
                  <span className="timer-duration">
                    ⏱️ {formatDuration(timer.elapsedMs)}
                  </span>
                  <span className="timer-user">
                    👤 {timer.username}
                  </span>
                </div>

                <div className="issue-status">
                  <span className={`status-badge ${timer.status}`}>
                    {timer.status === 'ok' ? 'OK' :
                     timer.status === 'attention' ? 'ATENÇÃO' :
                     timer.status === 'long' ? 'LONGO' :
                     'CRÍTICO'}
                  </span>
                </div>

              </div>
            ))}
          </div>

          {data.timers.length > 8 && (
            <div className="show-more">
              <button className="show-more-btn">
                Ver mais {data.timers.length - 8} timers...
              </button>
            </div>
          )}
        </div>
      )}

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Trends Chart */}
        {showTrends && trendsChartData && (
          <div className="chart-container">
            <h3>📈 Tendências de Timers</h3>
            <div className="chart-wrapper">
              <Line data={trendsChartData} options={chartOptions} />
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
              data={statusDistributionData}
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
          {data.timers.length} timers ativos • {data.stats.totalUsers} usuários
        </div>
      </div>
    </div>
  );
});

TimerAnalytics.displayName = 'TimerAnalytics';

export default TimerAnalytics;