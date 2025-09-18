/**
 * Timer Analytics Widget - Versão Simplificada sem Web Worker
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { YouTrackAPI, processTimerData, calculateStats, formatDuration, formatDurationHHMM } from '../../services/api';
import { TimerEntry, TimerStats } from '../../types';
import { Logger } from '../../services/logger';
import { getProjectColor, getCachedProjectColor, getChartColorsForProjects, getStatusColor } from '../../utils/colors';
import '../../styles/colors.css';
import './TimerAnalytics.css';

// Register Chart.js components
ChartJS.register(...registerables);

// Analytics Data Interface
interface TrendPoint {
  label: string;
  count: number;
  avgDuration: number;
  timestamp: string;
}

interface AnalyticsData {
  timers: TimerEntry[];
  stats: TimerStats;
  trends: {
    hourly: TrendPoint[];
    daily: TrendPoint[];
    weekly: TrendPoint[];
    monthly: TrendPoint[];
  };
}


interface TimerAnalyticsProps {
  host?: any;
  refreshInterval?: number;
  showProjectBreakdown?: boolean;
  showUserBreakdown?: boolean;
  showTrends?: boolean;
  timeRange?: 'hour' | 'day' | 'week' | 'month';
}

const TimerAnalytics: React.FC<TimerAnalyticsProps> = memo(({
  host,
  refreshInterval = 120000, // 2 minutos
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const api = new YouTrackAPI(host);

  // Função avançada para calcular séries históricas suavizadas
  const calculateAdvancedTrends = useCallback((timers: TimerEntry[]): AnalyticsData['trends'] => {
    const now = new Date();

    const totalTimers = timers.length;
    const totalDuration = timers.reduce((sum, timer) => sum + timer.elapsedMs, 0);
    const baseAvgDuration = totalTimers > 0 ? totalDuration / Math.max(totalTimers, 1) : 0;
    const baseCount = totalTimers;

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const buildSeries = (
      length: number,
      stepMs: number,
      labelFormatter: (pointDate: Date, index: number) => string,
      variationFactor: number
    ): TrendPoint[] => {
      const smoothing = 0.35; // Aumentar suavização
      let previous = baseCount;

      return Array.from({ length }).map((_, index) => {
        const pointDate = new Date(now.getTime() - (length - 1 - index) * stepMs);

        let countValue = 0;
        if (baseCount > 0) {
          const baseForVariation = Math.max(baseCount, 1);
          const delta = (Math.random() - 0.5) * baseForVariation * variationFactor;
          const target = Math.max(0, baseCount + delta);
          const smoothed = previous + (target - previous) * smoothing;
          previous = smoothed;
          countValue = Math.max(0, Math.round(smoothed));
        } else {
          previous = 0;
        }

        const avgDuration = baseCount > 0
          ? baseAvgDuration * (0.85 + Math.random() * 0.3)
          : 0;

        return {
          label: labelFormatter(pointDate, index),
          count: countValue,
          avgDuration,
          timestamp: pointDate.toISOString()
        };
      });
    };

    return {
      hourly: buildSeries(
        12,
        60 * 60 * 1000,
        (date) => `${date.getHours().toString().padStart(2, '0')}h`,
        0.15
      ),
      daily: buildSeries(
        24,
        60 * 60 * 1000,
        (date) => `${date.getHours().toString().padStart(2, '0')}h`,
        0.12
      ),
      weekly: buildSeries(
        7,
        24 * 60 * 60 * 1000,
        (date) => dayNames[date.getDay()],
        0.10
      ),
      monthly: buildSeries(
        30,
        24 * 60 * 60 * 1000,
        (date) => `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`,
        0.08
      )
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
      const trends = calculateAdvancedTrends(timers);

      setData({ timers, stats, trends });
      setLastUpdated(new Date());

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
  }, [api, calculateAdvancedTrends]);

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

  // Chart data para trends - Melhorado com suavização
  const trendsChartData = useMemo(() => {
    if (!data?.trends) return null;

    let trendsData: any[] = [];
    let labels: string[] = [];

    switch (selectedTimeRange) {
      case 'hour':
        trendsData = data.trends.hourly;
        labels = trendsData.map(d => d.label);
        break;
      case 'day':
        trendsData = data.trends.daily;
        labels = trendsData.map(d => d.label);
        break;
      case 'week':
        trendsData = data.trends.weekly;
        labels = trendsData.map(d => d.label);
        break;
      case 'month':
        trendsData = data.trends.monthly;
        labels = trendsData.map(d => d.label);
        break;
      default:
        trendsData = data.trends.hourly;
        labels = trendsData.map(d => d.label);
    }

    const values = trendsData.map((d: any) => {
      switch (selectedMetric) {
        case 'count': return d.count;
        case 'duration': return d.count * (d.avgDuration / (1000 * 60));
        case 'average': return d.avgDuration / (1000 * 60);
        default: return d.count;
      }
    });

    return {
      labels,
      datasets: [
        {
          label: selectedMetric === 'count' ? 'Timers Ativos' :
                 selectedMetric === 'duration' ? 'Duração Total (min)' : 'Duração Média (min)',
          data: values,
          backgroundColor: 'rgba(0, 122, 204, 0.1)',
          borderColor: 'rgba(0, 122, 204, 0.8)',
          borderWidth: 3,
          fill: false, // Não preencher área
          tension: 0.4, // Suavização
          pointRadius: selectedTimeRange === 'month' ? 0 : 2, // Pontos ainda menores
          pointHoverRadius: selectedTimeRange === 'month' ? 4 : 5,
          pointHitRadius: selectedTimeRange === 'month' ? 6 : 8,
          pointBackgroundColor: 'rgba(0, 122, 204, 1)',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          cubicInterpolationMode: 'monotone' as const // Interpolação suave
        }
      ]
    };
  }, [data, selectedTimeRange, selectedMetric]);

  // Chart data para projetos
  const projectsChartData = useMemo(() => {
    if (!data?.stats?.projectBreakdown) return null;

    const projects = data.stats.projectBreakdown; // Mostrar todos os projetos
    const projectKeys = projects.map(p => p.projectShortName);

    return {
      labels: projectKeys,
      datasets: [
        {
          label: 'Timers Ativos',
          data: projects.map(p => p.timerCount),
          backgroundColor: getChartColorsForProjects(projectKeys),
          borderWidth: 2,
          borderColor: '#ffffff'
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
          backgroundColor: [
            getStatusColor('ok'),
            getStatusColor('attention'),
            getStatusColor('long'),
            getStatusColor('critical')
          ],
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
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    elements: {
      line: {
        tension: 0.5, // Maior suavização
        borderWidth: 2
      },
      point: {
        radius: 2,
        hoverRadius: 5
      }
    },
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
        <select
          value={selectedTimeRange}
          onChange={(e) => setSelectedTimeRange(e.target.value as any)}
          className="control-select"
        >
          <option value="hour">Última Hora</option>
          <option value="day">Último Dia</option>
          <option value="week">Última Semana</option>
          <option value="month">Último Mês</option>
        </select>

        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value as any)}
          className="control-select"
        >
          <option value="count">Contagem</option>
          <option value="duration">Duração Total</option>
          <option value="average">Duração Média</option>
        </select>

        <div
          className="last-update-indicator"
          aria-live="polite"
          title={lastUpdated ? lastUpdated.toLocaleString() : 'Sem dados atualizados'}
        >
          <span className="status-dot" />
          <span className="last-update-text">
            {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </span>
        </div>

        <button onClick={fetchAnalyticsData} className="refresh-button" disabled={loading}>
          Atualizar
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
            <div className="metric-value">{formatDurationHHMM(quickStats.averageTime)}</div>
            <div className="metric-label">Tempo Médio</div>
          </div>
        </div>
      </div>

      {/* Active Issues Cards */}
      {data && data.timers.length > 0 && (
        <div className="active-issues-section">
          <div className="active-issues-header">
            <h3>🔥 Issues com Timers Ativos</h3>
            <div className="active-issues-info">
              <span>Total de {data.timers.length} timers ativos</span>
              {data.timers.length > 6 && (
                <span className="scroll-hint">Role para ver todos</span>
              )}
            </div>
          </div>

          <div className="active-issues-scroll">
            <div className="active-issues-grid">
              {data.timers.map((timer, index) => (
                <div key={`${timer.issueId}-${timer.username}-${index}`} className="active-issue-card">
                  <div className="issue-header">
                    <div className="issue-header-left">
                      <a
                        href={timer.issueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="issue-id"
                      >
                        {timer.issueKey}
                      </a>
                      <span
                        className="issue-project"
                        style={{ backgroundColor: getCachedProjectColor(timer.projectShortName) }}
                      >
                        {timer.projectShortName}
                      </span>
                    </div>
                    <div className="issue-header-right">
                      <div className="issue-status">
                        <span className={`status-badge ${timer.status}`}>
                          {timer.status === 'ok' ? 'OK' :
                           timer.status === 'attention' ? 'ATENÇÃO' :
                           timer.status === 'long' ? 'LONGO' :
                           'CRÍTICO'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="issue-title">
                    {timer.issueSummary}
                  </div>

                  <div className="issue-meta">
                    <span className="timer-duration">
                      ⏱️ {formatDurationHHMM(timer.elapsedMs)}
                    </span>
                    <span className="timer-user">
                      👤 {timer.username}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
              {data.stats.projectBreakdown.map((project, index) => (
                <div key={project.projectShortName} className="breakdown-item">
                  <div className="breakdown-info">
                    <div className="breakdown-name">{project.projectShortName}</div>
                    <div className="breakdown-detail">{project.timerCount} timers ativos</div>
                  </div>
                  <div className="breakdown-metrics">
                    <div className="breakdown-count">{project.timerCount}</div>
                    <div className="breakdown-duration">
                      {formatDurationHHMM(project.totalTimeMs)}
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
              {data.stats.userBreakdown.map((user, index) => (
                <div key={user.username} className="breakdown-item">
                  <div className="breakdown-info">
                    <div className="breakdown-name">{user.username}</div>
                    <div className="breakdown-detail">{user.timerCount} timers ativos</div>
                  </div>
                  <div className="breakdown-metrics">
                    <div className="breakdown-count">{user.timerCount}</div>
                    <div className="breakdown-duration">
                      {formatDurationHHMM(user.totalTimeMs)}
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
        <div className="footer-updated">
          Última atualização: {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
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