/**
 * User-Specific Timer Widget
 * Focused view for individual user timer tracking and management
 */

import React, { useState, useEffect, useCallback } from 'react';
import { YouTrackAPI, formatDuration } from '../../services/api';
import { TimerEntry, UserTimerStats } from '../../types';
import { Logger } from '../../services/logger';
import './UserTimer.css';

export interface UserTimerProps {
  host?: any;
  username?: string;
  refreshInterval?: number;
  showQuickActions?: boolean;
  compactMode?: boolean;
  compact?: boolean;
  showDetails?: boolean;
}

interface UserTimerData {
  activeTimers: TimerEntry[];
  userStats: UserTimerStats;
  recentActivity: TimerEntry[];
  longestTimer: TimerEntry | null;
}

const UserTimer: React.FC<UserTimerProps> = ({
  host,
  username,
  refreshInterval = 30000,
  showQuickActions = true,
  compactMode = false
}) => {
  const [data, setData] = useState<UserTimerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimer, setSelectedTimer] = useState<string | null>(null);

  const logger = Logger.getLogger('UserTimer');
  const api = new YouTrackAPI(host);

  const fetchUserTimerData = useCallback(async () => {
    if (!username) {
      setError('Nome de usuário é obrigatório');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const issues = await api.fetchIssuesWithTimers({
        limit: 100
      });

      const allTimers = api.processTimerData ? api.processTimerData(issues) : [];
      const userTimers = allTimers.filter((timer: any) => timer.username === username);

      const activeTimers = userTimers.filter((timer: any) => timer.status !== 'stopped');
      const recentActivity = userTimers
        .sort((a: any, b: any) => b.startTime - a.startTime)
        .slice(0, 5);

      const longestTimer = userTimers.length > 0
        ? userTimers.reduce((longest: any, current: any) =>
            current.elapsedMs > longest.elapsedMs ? current : longest
          )
        : null;

      const projectsSet = new Set(userTimers.map((t: any) => t.projectShortName));
      const totalTimeMs = userTimers.reduce((sum: any, t: any) => sum + t.elapsedMs, 0);
      const criticalCount = userTimers.filter((t: any) => t.status === 'critical').length;

      const userStats: UserTimerStats = {
        username,
        timerCount: userTimers.length,
        totalTimeMs,
        longestTimerMs: longestTimer?.elapsedMs || 0,
        criticalCount,
        projects: Array.from(projectsSet) as string[],
        averageTimeMs: userTimers.length > 0 ? totalTimeMs / userTimers.length : 0
      };

      setData({
        activeTimers,
        userStats,
        recentActivity,
        longestTimer
      });

      logger.info('User timer data updated', {
        username,
        activeCount: activeTimers.length,
        totalCount: userTimers.length
      });

    } catch (err) {
      logger.error('Failed to fetch user timer data', err as Error);
      setError('Falha ao carregar dados do usuário');
    } finally {
      setLoading(false);
    }
  }, [api, username]);

  useEffect(() => {
    fetchUserTimerData();
    const interval = setInterval(fetchUserTimerData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchUserTimerData, refreshInterval]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'critical': return '🚨';
      case 'long': return '⚠️';
      case 'attention': return '⏰';
      default: return '✅';
    }
  };

  const getStatusClass = (status: string) => {
    return `status-${status}`;
  };

  if (loading && !data) {
    return (
      <div className={`widget-container user-timer ${compactMode ? 'compact' : ''}`}>
        <div className="loading-container">
          <div className="loader"></div>
          <span>Carregando dados do usuário...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`widget-container user-timer ${compactMode ? 'compact' : ''}`}>
        <div className="error-container">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button onClick={fetchUserTimerData} className="retry-button">
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`widget-container user-timer ${compactMode ? 'compact' : ''}`}>
        <div className="empty-state">
          <span className="empty-icon">👤</span>
          <span>Nenhum dado encontrado</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`widget-container user-timer ${compactMode ? 'compact' : ''}`}>
      {/* Header */}
      <div className="user-timer-header">
        <div className="user-info">
          <span className="user-icon">👤</span>
          <div className="user-details">
            <h3 className="username">{username}</h3>
            <span className="user-subtitle">
              {data.activeTimers.length} timer{data.activeTimers.length !== 1 ? 's' : ''} ativo{data.activeTimers.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="header-actions">
          {showQuickActions && (
            <button onClick={fetchUserTimerData} className="refresh-button" disabled={loading}>
              {loading ? '⟳' : '↻'}
            </button>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="quick-stats">
        <div className="stat-item">
          <span className="stat-icon">⏱️</span>
          <div className="stat-content">
            <span className="stat-value">{data.userStats.timerCount}</span>
            <span className="stat-label">Total</span>
          </div>
        </div>
        <div className="stat-item">
          <span className="stat-icon">🚨</span>
          <div className="stat-content">
            <span className="stat-value">{data.userStats.criticalCount}</span>
            <span className="stat-label">Críticos</span>
          </div>
        </div>
        <div className="stat-item">
          <span className="stat-icon">📊</span>
          <div className="stat-content">
            <span className="stat-value">{formatDuration(data.userStats.averageTimeMs, { precision: 'low' })}</span>
            <span className="stat-label">Média</span>
          </div>
        </div>
      </div>

      {/* Active Timers */}
      {data.activeTimers.length > 0 && (
        <div className="active-timers-section">
          <h4 className="section-title">Timers Ativos</h4>
          <div className="timers-list">
            {data.activeTimers.map((timer) => (
              <div
                key={timer.id}
                className={`timer-item ${getStatusClass(timer.status)} ${selectedTimer === timer.id ? 'selected' : ''}`}
                onClick={() => setSelectedTimer(selectedTimer === timer.id ? null : timer.id)}
              >
                <div className="timer-status">
                  <span className="status-icon">{getStatusIcon(timer.status)}</span>
                </div>
                <div className="timer-info">
                  <div className="timer-header">
                    <span className="issue-key">{timer.issueKey}</span>
                    <span className="timer-duration">{formatDuration(timer.elapsedMs)}</span>
                  </div>
                  <div className="timer-summary">{timer.issueSummary}</div>
                  <div className="timer-meta">
                    <span className="project-name">{timer.projectShortName}</span>
                    <span className="start-time">
                      Iniciado: {new Date(timer.startTime).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {!compactMode && data.recentActivity.length > 0 && (
        <div className="recent-activity-section">
          <h4 className="section-title">Atividade Recente</h4>
          <div className="activity-list">
            {data.recentActivity.slice(0, 3).map((timer) => (
              <div key={timer.id} className="activity-item">
                <div className="activity-info">
                  <span className="activity-issue">{timer.issueKey}</span>
                  <span className="activity-duration">{formatDuration(timer.elapsedMs)}</span>
                </div>
                <div className="activity-time">
                  {new Date(timer.startTime).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Longest Timer */}
      {!compactMode && data.longestTimer && (
        <div className="longest-timer-section">
          <h4 className="section-title">Timer Mais Longo</h4>
          <div className="longest-timer-card">
            <div className="longest-timer-info">
              <span className="longest-issue">{data.longestTimer.issueKey}</span>
              <span className="longest-duration">{formatDuration(data.longestTimer.elapsedMs)}</span>
            </div>
            <div className="longest-summary">{data.longestTimer.issueSummary}</div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="user-timer-footer">
        <span className="last-update">
          Atualizado: {new Date().toLocaleTimeString()}
        </span>
        {!compactMode && (
          <span className="next-refresh">
            Próxima: {Math.ceil(refreshInterval / 1000)}s
          </span>
        )}
      </div>
    </div>
  );
};

export default UserTimer;
