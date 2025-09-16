/**
 * Project Dashboard Widget
 * Comprehensive project-level timer monitoring and team management
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { YouTrackAPI, formatDuration } from '../../services/api';
import { TimerEntry, ProjectTimerStats } from '../../types';
import { Logger } from '../../services/logger';
import './ProjectDashboard.css';

interface ProjectDashboardProps {
  host?: any;
  projectId?: string;
  refreshInterval?: number;
  showTeamBreakdown?: boolean;
  showIssueBreakdown?: boolean;
  showTrends?: boolean;
}

interface ProjectDashboardData {
  projectStats: ProjectTimerStats;
  activeTimers: TimerEntry[];
  teamBreakdown: { username: string; timerCount: number; totalTimeMs: number; longestTimerMs: number; }[];
  issueBreakdown: { issueKey: string; issueSummary: string; timerCount: number; totalTimeMs: number; status: string; }[];
  statusDistribution: { [key: string]: number };
  timeDistribution: { [key: string]: number };
}

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  host,
  projectId,
  refreshInterval = 45000,
  showTeamBreakdown = true,
  showIssueBreakdown = true,
  showTrends = true
}) => {
  const [data, setData] = useState<ProjectDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'overview' | 'team' | 'issues'>('overview');
  const [sortBy, setSortBy] = useState<'time' | 'count' | 'name'>('time');

  const logger = Logger.getLogger('ProjectDashboard');
  const api = new YouTrackAPI(host);

  const fetchProjectData = useCallback(async () => {
    if (!projectId) {
      setError('ID do projeto é obrigatório');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const issues = await api.fetchIssuesWithTimers({
        projectId,
        limit: 500
      });

      const allTimers = api.processTimerData ? api.processTimerData(issues) : [];
      const projectTimers = allTimers.filter((timer: any) => timer.projectShortName === projectId);

      if (projectTimers.length === 0) {
        setData(null);
        return;
      }

      const activeTimers = projectTimers.filter((timer: any) => timer.status !== 'stopped');

      // Team breakdown
      const teamMap = new Map<string, { timerCount: number; totalTimeMs: number; longestTimerMs: number; }>();
      projectTimers.forEach((timer: any) => {
        const existing = teamMap.get(timer.username) || { timerCount: 0, totalTimeMs: 0, longestTimerMs: 0 };
        existing.timerCount++;
        existing.totalTimeMs += timer.elapsedMs;
        existing.longestTimerMs = Math.max(existing.longestTimerMs, timer.elapsedMs);
        teamMap.set(timer.username, existing);
      });

      const teamBreakdown = Array.from(teamMap.entries()).map(([username, stats]) => ({
        username,
        ...stats
      }));

      // Issue breakdown
      const issueMap = new Map<string, { issueSummary: string; timerCount: number; totalTimeMs: number; status: string; }>();
      projectTimers.forEach((timer: any) => {
        const existing = issueMap.get(timer.issueKey) || {
          issueSummary: timer.issueSummary,
          timerCount: 0,
          totalTimeMs: 0,
          status: 'unknown'
        };
        existing.timerCount++;
        existing.totalTimeMs += timer.elapsedMs;
        if (timer.status === 'critical') existing.status = 'critical';
        else if (timer.status === 'long' && existing.status !== 'critical') existing.status = 'long';
        else if (timer.status === 'attention' && !['critical', 'long'].includes(existing.status)) existing.status = 'attention';
        else if (existing.status === 'unknown') existing.status = 'ok';
        issueMap.set(timer.issueKey, existing);
      });

      const issueBreakdown = Array.from(issueMap.entries()).map(([issueKey, stats]) => ({
        issueKey,
        ...stats
      }));

      // Status and time distributions
      const statusDistribution = {
        ok: projectTimers.filter((t: any) => t.status === 'ok').length,
        attention: projectTimers.filter((t: any) => t.status === 'attention').length,
        long: projectTimers.filter((t: any) => t.status === 'long').length,
        critical: projectTimers.filter((t: any) => t.status === 'critical').length,
        overtime: projectTimers.filter((t: any) => t.status === 'overtime').length
      };

      const timeDistribution = {
        '< 1h': projectTimers.filter((t: any) => t.elapsedMs < 3600000).length,
        '1-2h': projectTimers.filter((t: any) => t.elapsedMs >= 3600000 && t.elapsedMs < 7200000).length,
        '2-4h': projectTimers.filter((t: any) => t.elapsedMs >= 7200000 && t.elapsedMs < 14400000).length,
        '4-8h': projectTimers.filter((t: any) => t.elapsedMs >= 14400000 && t.elapsedMs < 28800000).length,
        '> 8h': projectTimers.filter((t: any) => t.elapsedMs >= 28800000).length
      };

      const uniqueUsers = new Set(projectTimers.map((t: any) => t.username));
      const totalTimeMs = projectTimers.reduce((sum: any, t: any) => sum + t.elapsedMs, 0);
      const criticalCount = projectTimers.filter((t: any) => t.status === 'critical').length;

      const projectStats: ProjectTimerStats = {
        projectId,
        projectName: projectTimers[0]?.projectName || projectId,
        projectShortName: projectId,
        timerCount: projectTimers.length,
        totalTimeMs,
        criticalCount,
        users: Array.from(uniqueUsers) as string[],
        averageTimeMs: projectTimers.length > 0 ? totalTimeMs / projectTimers.length : 0
      };

      setData({
        projectStats,
        activeTimers,
        teamBreakdown,
        issueBreakdown,
        statusDistribution,
        timeDistribution
      });

      logger.info('Project dashboard data updated', {
        projectId,
        timerCount: projectTimers.length,
        activeCount: activeTimers.length,
        teamSize: uniqueUsers.size
      });

    } catch (err) {
      logger.error('Failed to fetch project dashboard data', err as Error);
      setError('Falha ao carregar dados do projeto');
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => {
    fetchProjectData();
    const interval = setInterval(fetchProjectData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchProjectData, refreshInterval]);

  // Sorted data based on current sort preference
  const sortedTeamBreakdown = useMemo(() => {
    if (!data) return [];
    return [...data.teamBreakdown].sort((a, b) => {
      switch (sortBy) {
        case 'time': return b.totalTimeMs - a.totalTimeMs;
        case 'count': return b.timerCount - a.timerCount;
        case 'name': return a.username.localeCompare(b.username);
        default: return 0;
      }
    });
  }, [data, sortBy]);

  const sortedIssueBreakdown = useMemo(() => {
    if (!data) return [];
    return [...data.issueBreakdown].sort((a, b) => {
      switch (sortBy) {
        case 'time': return b.totalTimeMs - a.totalTimeMs;
        case 'count': return b.timerCount - a.timerCount;
        case 'name': return a.issueKey.localeCompare(b.issueKey);
        default: return 0;
      }
    });
  }, [data, sortBy]);

  // Chart configurations
  const statusChartData = useMemo(() => {
    if (!data) return null;
    return {
      labels: ['OK', 'Atenção', 'Longo', 'Crítico', 'Overtime'],
      datasets: [{
        data: Object.values(data.statusDistribution),
        backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545', '#6f42c1']
      }]
    };
  }, [data]);

  const timeChartData = useMemo(() => {
    if (!data) return null;
    return {
      labels: Object.keys(data.timeDistribution),
      datasets: [{
        label: 'Número de Timers',
        data: Object.values(data.timeDistribution),
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    };
  }, [data]);

  const teamChartData = useMemo(() => {
    if (!data) return null;
    const topTeam = sortedTeamBreakdown.slice(0, 8);
    return {
      labels: topTeam.map(t => t.username),
      datasets: [{
        label: 'Tempo Total (horas)',
        data: topTeam.map(t => t.totalTimeMs / (1000 * 60 * 60)),
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1
      }]
    };
  }, [sortedTeamBreakdown]);

  if (loading && !data) {
    return (
      <div className="project-dashboard">
        <div className="loading-container">
          <div className="loader"></div>
          <span>Carregando dashboard do projeto...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-dashboard">
        <div className="error-container">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button onClick={fetchProjectData} className="retry-button">
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="project-dashboard">
        <div className="empty-state">
          <span className="empty-icon">📁</span>
          <span>Nenhum timer ativo neste projeto</span>
        </div>
      </div>
    );
  }

  return (
    <div className="project-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="project-info">
          <span className="project-icon">📁</span>
          <div className="project-details">
            <h3 className="project-name">{data.projectStats.projectName}</h3>
            <span className="project-subtitle">
              {data.projectStats.timerCount} timers • {data.projectStats.users.length} usuários
            </span>
          </div>
        </div>
        <div className="header-controls">
          <select
            value={selectedView}
            onChange={(e) => setSelectedView(e.target.value as any)}
            className="view-select"
          >
            <option value="overview">Visão Geral</option>
            <option value="team">Equipe</option>
            <option value="issues">Issues</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="sort-select"
          >
            <option value="time">Ordenar por Tempo</option>
            <option value="count">Ordenar por Quantidade</option>
            <option value="name">Ordenar por Nome</option>
          </select>
          <button onClick={fetchProjectData} className="refresh-button" disabled={loading}>
            {loading ? '⟳' : '↻'} Atualizar
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="project-metrics">
        <div className="metric-card">
          <div className="metric-icon">⏱️</div>
          <div className="metric-content">
            <div className="metric-value">{data.projectStats.timerCount}</div>
            <div className="metric-label">Total Timers</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">▶️</div>
          <div className="metric-content">
            <div className="metric-value">{data.activeTimers.length}</div>
            <div className="metric-label">Ativos</div>
          </div>
        </div>
        <div className="metric-card critical">
          <div className="metric-icon">🚨</div>
          <div className="metric-content">
            <div className="metric-value">{data.projectStats.criticalCount}</div>
            <div className="metric-label">Críticos</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">👥</div>
          <div className="metric-content">
            <div className="metric-value">{data.projectStats.users.length}</div>
            <div className="metric-label">Membros Ativos</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{formatDuration(data.projectStats.averageTimeMs, { precision: 'low' })}</div>
            <div className="metric-label">Tempo Médio</div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      {selectedView === 'overview' && (
        <div className="charts-section">
          <div className="chart-container">
            <h4>Distribuição por Status</h4>
            <div className="chart-wrapper">
              <Doughnut
                data={statusChartData!}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'right' as const }
                  }
                }}
              />
            </div>
          </div>
          <div className="chart-container">
            <h4>Distribuição por Duração</h4>
            <div className="chart-wrapper">
              <Bar
                data={timeChartData!}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true }
                  }
                }}
              />
            </div>
          </div>
          {showTeamBreakdown && teamChartData && (
            <div className="chart-container full-width">
              <h4>Tempo por Membro da Equipe</h4>
              <div className="chart-wrapper">
                <Bar
                  data={teamChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          callback: (value: any) => `${value}h`
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team Breakdown */}
      {selectedView === 'team' && showTeamBreakdown && (
        <div className="breakdown-section">
          <h4>Breakdown da Equipe</h4>
          <div className="breakdown-list">
            {sortedTeamBreakdown.slice(0, 10).map((member) => (
              <div key={member.username} className="breakdown-item">
                <div className="member-info">
                  <span className="member-icon">👤</span>
                  <div className="member-details">
                    <span className="member-name">{member.username}</span>
                    <span className="member-stats">
                      {member.timerCount} timer{member.timerCount !== 1 ? 's' : ''} •
                      Mais longo: {formatDuration(member.longestTimerMs)}
                    </span>
                  </div>
                </div>
                <div className="member-metrics">
                  <span className="member-total">{formatDuration(member.totalTimeMs)}</span>
                  <span className="member-avg">{formatDuration(member.totalTimeMs / member.timerCount)}/timer</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issue Breakdown */}
      {selectedView === 'issues' && showIssueBreakdown && (
        <div className="breakdown-section">
          <h4>Breakdown por Issue</h4>
          <div className="breakdown-list">
            {sortedIssueBreakdown.slice(0, 10).map((issue) => (
              <div key={issue.issueKey} className={`breakdown-item status-${issue.status}`}>
                <div className="issue-info">
                  <span className="issue-icon">🎫</span>
                  <div className="issue-details">
                    <span className="issue-key">{issue.issueKey}</span>
                    <span className="issue-summary">{issue.issueSummary}</span>
                  </div>
                </div>
                <div className="issue-metrics">
                  <span className="issue-total">{formatDuration(issue.totalTimeMs)}</span>
                  <span className="issue-count">{issue.timerCount} timer{issue.timerCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="dashboard-footer">
        <span className="last-update">
          Última atualização: {new Date().toLocaleTimeString()}
        </span>
        <span className="next-refresh">
          Próxima atualização em: {Math.ceil(refreshInterval / 1000)}s
        </span>
      </div>
    </div>
  );
};

export default ProjectDashboard;