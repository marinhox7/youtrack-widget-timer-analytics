/**
 * Advanced Timer Analytics Widget
 * Provides comprehensive analytics and insights for timer data
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { format, subDays, subHours, isWithinInterval } from 'date-fns';
import { YouTrackAPI, processTimerData, calculateStats, formatDuration } from '../../services/api';
import { TimerEntry, TimerStats, ProjectTimerStats, UserTimerStats } from '../../types';
import { Logger } from '../../services/logger';
import './TimerAnalytics.css';

// Register Chart.js components
ChartJS.register(...registerables);

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

const TimerAnalytics: React.FC<TimerAnalyticsProps> = ({
  host,
  refreshInterval = 60000, // 1 minute for analytics
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
  const [userPermissions, setUserPermissions] = useState({ isAdmin: false, canManageTimers: false });
  const [cancelingTimer, setCancelingTimer] = useState<string | null>(null);

  const logger = Logger.getLogger('TimerAnalytics');
  const api = new YouTrackAPI(host);

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const issues = await api.fetchIssuesWithTimers({
        projectId: selectedProject === 'all' ? undefined : selectedProject,
        limit: 1000 // Get more data for analytics
      });

      const timers = processTimerData(issues);
      const stats = calculateStats(timers);
      const trends = calculateTrends(timers, selectedTimeRange);

      setData({ timers, stats, trends });
      logger.info('Analytics data updated', { timerCount: timers.length, projectCount: stats.projectBreakdown.length });

    } catch (err) {
      logger.error('Failed to fetch analytics data', err as Error);
      setError('Falha ao carregar dados de analytics');
    } finally {
      setLoading(false);
    }
  }, [api, selectedProject, selectedTimeRange]);

  // Check user permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const permissions = await api.checkUserPermissions();
        setUserPermissions(permissions);
        logger.info('User permissions checked', permissions);
      } catch (error) {
        logger.warn('Failed to check permissions, assuming no admin access', error as Error);
        setUserPermissions({ isAdmin: false, canManageTimers: false });
      }
    };

    if (host) {
      checkPermissions();
    }
  }, [api, host, logger]);

  // Cancel timer function
  const handleCancelTimer = useCallback(async (issueId: string, issueKey: string, username: string) => {
    if (!userPermissions.canManageTimers) {
      logger.warn('User attempted to cancel timer without permissions', { issueId, issueKey, username });
      setError('Apenas usuários system-admin podem cancelar timers');
      return;
    }

    try {
      setCancelingTimer(issueId);
      logger.info('Cancelling timer', { issueId, issueKey, username });

      await api.cancelTimer(issueId);

      // Refresh data to reflect changes
      await fetchAnalyticsData();

      logger.info('Timer cancelled successfully', { issueId, issueKey, username });
      setError(null);

    } catch (error: any) {
      logger.error('Failed to cancel timer', error as Error, { issueId, issueKey, username });

      if (error.code === 'CANCEL_TIMER_PERMISSION_DENIED') {
        setError('Permissões insuficientes para cancelar timer. Acesso system-admin necessário.');
      } else if (error.code === 'ISSUE_OR_FIELD_NOT_FOUND') {
        setError(`Issue ${issueKey} não encontrado ou campo Timer Youtrack não disponível`);
      } else {
        setError(`Falha ao cancelar timer para ${issueKey}: ${error.message}`);
      }
    } finally {
      setCancelingTimer(null);
    }
  }, [api, userPermissions.canManageTimers, fetchAnalyticsData, logger]);

  // Auto refresh
  useEffect(() => {
    fetchAnalyticsData();
    const interval = setInterval(fetchAnalyticsData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAnalyticsData, refreshInterval]);


  // Calculate trends data
  const calculateTrends = (timers: TimerEntry[], range: string) => {
    const now = new Date();
    const cutoffTime = range === 'day' ? subHours(now, 24) :
                      range === 'week' ? subDays(now, 7) :
                      subDays(now, 30);

    const relevantTimers = timers.filter(timer =>
      timer.startTime >= cutoffTime.getTime()
    );

    // Hourly trends (last 24 hours)
    const hourly = Array.from({ length: 24 }, (_, i) => {
      const hour = (now.getHours() - i + 24) % 24;
      const hourStart = new Date(now);
      hourStart.setHours(hour, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hour + 1);

      const hourTimers = relevantTimers.filter(timer =>
        timer.startTime >= hourStart.getTime() && timer.startTime < hourEnd.getTime()
      );

      return {
        hour,
        count: hourTimers.length,
        avgDuration: hourTimers.length > 0 ? hourTimers.reduce((sum, t) => sum + t.elapsedMs, 0) / hourTimers.length : 0
      };
    }).reverse();

    // Daily trends
    const daily = Array.from({ length: range === 'month' ? 30 : 7 }, (_, i) => {
      const date = subDays(now, i);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayTimers = relevantTimers.filter(timer =>
        timer.startTime >= dayStart.getTime() && timer.startTime <= dayEnd.getTime()
      );

      return {
        date: format(date, 'MMM dd'),
        count: dayTimers.length,
        avgDuration: dayTimers.length > 0 ? dayTimers.reduce((sum, t) => sum + t.elapsedMs, 0) / dayTimers.length : 0
      };
    }).reverse();

    return { hourly, daily, weekly: [] }; // Weekly calculation omitted for brevity
  };

  // Chart configurations
  const chartOptions = {
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
  };

  // Memoized chart data
  const trendsChartData = useMemo(() => {
    if (!data) return null;

    const trendsData = selectedTimeRange === 'day' ? data.trends.hourly : data.trends.daily;
    const labels = selectedTimeRange === 'day'
      ? trendsData.map((d: any) => `${d.hour}:00`)
      : trendsData.map((d: any) => d.date);

    const values = trendsData.map((d: any) => {
      switch (selectedMetric) {
        case 'count': return d.count;
        case 'duration': return d.count * d.avgDuration;
        case 'average': return d.avgDuration;
        default: return d.count;
      }
    });

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
  }, [data, selectedTimeRange, selectedMetric]);

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

    const statusCounts = {
      ok: data.timers.filter(t => t.status === 'ok').length,
      attention: data.timers.filter(t => t.status === 'attention').length,
      long: data.timers.filter(t => t.status === 'long').length,
      critical: data.timers.filter(t => t.status === 'critical').length,
      overtime: data.timers.filter(t => t.status === 'overtime').length
    };

    return {
      labels: ['OK', 'Attention', 'Long', 'Critical', 'Overtime'],
      datasets: [
        {
          data: Object.values(statusCounts),
          backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545', '#6f42c1']
        }
      ]
    };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="timer-analytics">
        <div className="loading-container">
          <div className="loader"></div>
          <span>Carregando analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="timer-analytics">
        <div className="error-container">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button onClick={fetchAnalyticsData} className="retry-button">
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="timer-analytics">
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          <span>Nenhum dado de analytics disponível</span>
        </div>
      </div>
    );
  }

  return (
    <div className="timer-analytics">
      {/* Header */}
      <div className="analytics-header">
        <h2>📊 Timer Analytics</h2>
        <div className="header-controls">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
            className="control-select"
          >
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
        {userPermissions.canManageTimers && (
          <div className="admin-notice">
            <span className="admin-badge">🔧 System Admin</span>
            <span className="admin-text">Você pode cancelar timers de outros usuários</span>
          </div>
        )}
        <div className="active-issues-grid">
          {data.timers.length > 0 ? (
            data.timers.slice(0, 10).map((timer, index) => (
              <div key={`${timer.issueId}-${index}`} className="active-issue-card">
                <div className="issue-content">
                  <div className="issue-header">
                    <span className="issue-id">{timer.issueKey}</span>
                    <span className="issue-project">{timer.projectShortName}</span>
                  </div>
                  <div className="issue-title">{timer.issueSummary}</div>
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

                {userPermissions.canManageTimers && (
                  <div className="timer-actions">
                    <button
                      className="cancel-timer-button"
                      onClick={() => handleCancelTimer(timer.issueId, timer.issueKey, timer.username)}
                      disabled={cancelingTimer === timer.issueId}
                      title={`Cancelar Timer para ${timer.issueKey} (usuário: ${timer.username})`}
                    >
                      {cancelingTimer === timer.issueId ? (
                        <>
                          <span className="loading-spinner">⟳</span>
                          <span>Cancelando...</span>
                        </>
                      ) : (
                        <>
                          <span>🛑</span>
                          <span>Cancelar</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="no-active-issues">
              <div className="empty-icon">💤</div>
              <p>Nenhum timer ativo no momento</p>
            </div>
          )}
        </div>
        {data.timers.length > 10 && (
          <div className="show-more">
            <button className="show-more-btn">
              Ver mais {data.timers.length - 10} issues...
            </button>
          </div>
        )}
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
        <span>Próxima atualização em: {Math.ceil(refreshInterval / 1000)}s</span>
      </div>
    </div>
  );
};

export default TimerAnalytics;