import React, {useState, useEffect, useCallback} from 'react';
import { YouTrackAPI, processTimerData, calculateStats, formatDuration } from '../../services/api';
import { TimerEntry, TimerStats } from '../../types';
import './styles.css';

export interface TimerDashboardProps {
  host?: any;
  refreshInterval?: number;
  compact?: boolean;
  showProjectBreakdown?: boolean;
}

const TimerDashboard: React.FC<TimerDashboardProps> = ({
  host,
  refreshInterval = 30000 // 30 seconds
}) => {
  const [timers, setTimers] = useState<TimerEntry[]>([]);
  const [stats, setStats] = useState<TimerStats>({
    totalUsers: 0,
    totalTimers: 0,
    criticalTimers: 0,
    longTimers: 0,
    attentionTimers: 0,
    totalTimeMs: 0,
    averageTimeMs: 0,
    longestTimerMs: 0,
    projectBreakdown: [],
    userBreakdown: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [nextUpdateIn, setNextUpdateIn] = useState<number>(refreshInterval / 1000);
  const [userPermissions, setUserPermissions] = useState<{ isAdmin: boolean; canManageTimers: boolean }>({ isAdmin: false, canManageTimers: false });
  const [cancelingTimer, setCancelingTimer] = useState<string | null>(null);

  const api = new YouTrackAPI(host);

  const fetchTimers = useCallback(async () => {
    console.log('[Timer Dashboard] Fetching timers...');
    setLoading(true);
    setError(null);

    try {
      let entries: TimerEntry[];

      const issues = await api.fetchIssuesWithTimers();
      entries = processTimerData(issues);

      setTimers(entries);
      setStats(calculateStats(entries));
      setLastUpdate(new Date());
      console.log('[Timer Dashboard] Successfully updated timers:', entries.length);

    } catch (err) {
      console.error('[Timer Dashboard] Error fetching timers:', err);
      setError('Erro ao carregar timers. Usando dados de exemplo.');

      // Clear timers on error
      setTimers([]);
      setStats({
        totalUsers: 0,
        totalTimers: 0,
        criticalTimers: 0,
        longTimers: 0,
        attentionTimers: 0,
        totalTimeMs: 0,
        averageTimeMs: 0,
        longestTimerMs: 0,
        projectBreakdown: [],
        userBreakdown: []
      });
    } finally {
      setLoading(false);
    }
  }, [host]);

  // Check user permissions only once on mount
  useEffect(() => {
    let isMounted = true;

    const checkPermissions = async () => {
      console.log('[Timer Dashboard] Starting permission check...', { hasHost: !!host });
      try {
        const permissions = await api.checkUserPermissions();
        if (isMounted) {
          setUserPermissions(permissions);
          console.log('[Timer Dashboard] User permissions checked successfully:', permissions);
        }
      } catch (error) {
        if (isMounted) {
          console.warn('[Timer Dashboard] Failed to check user permissions:', error);
          setUserPermissions({ isAdmin: false, canManageTimers: false });
        }
      }
    };

    // Check permissions only once when component mounts and has host
    if (host) {
      checkPermissions();
    }

    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - run only once

  // Cancel timer function
  const handleCancelTimer = useCallback(async (issueId: string, issueKey: string) => {
    if (!userPermissions.canManageTimers) {
      console.warn('[Timer Dashboard] User does not have permission to cancel timers');
      return;
    }

    try {
      setCancelingTimer(issueId);
      console.log('[Timer Dashboard] Cancelling timer for', issueKey);

      // Stop the timer via Timer field
      await api.stopTimer(issueId);

      // Refresh data to show changes
      await fetchTimers();

      console.log('[Timer Dashboard] Timer cancelled successfully', { issueId, issueKey });
    } catch (error) {
      console.error('[Timer Dashboard] Failed to cancel timer', { issueId, issueKey, error });
      setError(`Falha ao cancelar timer para ${issueKey}`);
    } finally {
      setCancelingTimer(null);
    }
  }, [api, userPermissions.canManageTimers, fetchTimers]);

  // Auto refresh functionality
  useEffect(() => {
    fetchTimers();

    const refreshTimer = setInterval(() => {
      fetchTimers();
    }, refreshInterval);

    return () => clearInterval(refreshTimer);
  }, [fetchTimers, refreshInterval]);

  // Countdown timer for next update
  useEffect(() => {
    const countdownTimer = setInterval(() => {
      setNextUpdateIn(prev => {
        if (prev <= 1) {
          return refreshInterval / 1000;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [lastUpdate, refreshInterval]);

  // Update elapsed times every second
  useEffect(() => {
    const updateTimer = setInterval(() => {
      setTimers(currentTimers =>
        currentTimers.map(timer => ({
          ...timer,
          elapsedMs: Date.now() - timer.startTime
        }))
      );
    }, 1000);

    return () => clearInterval(updateTimer);
  }, []);

  const getStatusIcon = (status: TimerEntry['status']): string => {
    switch (status) {
      case 'ok': return '🟢';
      case 'attention': return '🟡';
      case 'long': return '🟠';
      case 'critical': return '🚨';
      default: return '⚪';
    }
  };

  const getStatusColor = (status: TimerEntry['status']): string => {
    switch (status) {
      case 'ok': return '#28a745';
      case 'attention': return '#ffc107';
      case 'long': return '#fd7e14';
      case 'critical': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const groupedTimers = timers.reduce((groups, timer) => {
    if (!groups[timer.username]) {
      groups[timer.username] = [];
    }
    groups[timer.username].push(timer);
    return groups;
  }, {} as Record<string, TimerEntry[]>);

  if (loading && timers.length === 0) {
    return (
      <div className="widget-container timer-dashboard">
        <div className="loading-container">
          <div className="loader"></div>
          <span>Carregando timers ativos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="widget-container timer-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-title">
          <span className="fire-emoji">🔥</span>
          Timers Ativos - Braip
          <span className={`timer-count ${stats.criticalTimers > 0 ? 'critical' : 'normal'}`}>
            {timers.length}
          </span>
        </div>
        <button
          className="refresh-button"
          onClick={() => fetchTimers()}
          disabled={loading}
        >
          {loading ? 'Atualizando...' : 'Refresh'}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-warning">
          {error}
        </div>
      )}

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <div className="stat-label">Usuários</div>
          <div className="stat-value">{stats.totalUsers}</div>
        </div>
        <div className="stat-item">
          <div className={`stat-label ${stats.criticalTimers > 0 ? 'critical' : ''}`}>
            Críticos
          </div>
          <div className={`stat-value ${stats.criticalTimers > 0 ? 'critical' : ''}`}>
            {stats.criticalTimers}
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Tempo Total</div>
          <div className="stat-value">{formatDuration(stats.totalTimeMs)}</div>
        </div>
      </div>

      {/* Timer List */}
      <div className="timer-list">
        {Object.entries(groupedTimers).map(([username, userTimers]) => (
          <div key={username} className="user-group">
            {/* User Header */}
            <div className="user-header">
              <span className="user-icon">👤</span>
              <span className="username">{username}</span>
              <span className="timer-count-small">
                ({(userTimers as TimerEntry[]).length} timer{(userTimers as TimerEntry[]).length > 1 ? 's' : ''})
              </span>
            </div>

            {/* User's Timers */}
            {(userTimers as TimerEntry[]).map((timer) => (
              <div
                key={`${timer.username}-${timer.issueId}`}
                className="timer-entry"
                style={{ borderLeftColor: getStatusColor(timer.status) }}
              >
                <div className="timer-info">
                  <div className="timer-header">
                    <span className="status-icon">{getStatusIcon(timer.status)}</span>
                    <a
                      href={timer.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="issue-key"
                    >
                      {timer.issueKey}
                    </a>
                  </div>
                  <div className="issue-summary">
                    {timer.issueSummary}
                  </div>
                </div>

                <div className="timer-actions">
                  <div className="timer-duration" style={{ color: getStatusColor(timer.status) }}>
                    {formatDuration(timer.elapsedMs)}
                  </div>
                  {userPermissions.canManageTimers && (
                    <button
                      className="cancel-timer-btn"
                      onClick={() => handleCancelTimer(timer.issueId, timer.issueKey)}
                      disabled={cancelingTimer === timer.issueId}
                      title="Cancelar timer do usuário (Admin)"
                    >
                      {cancelingTimer === timer.issueId ? '⏳ Cancelando...' : '🛑 Cancelar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        {timers.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-icon">⏰</div>
            <div className="empty-title">Nenhum timer ativo encontrado</div>
            <div className="empty-subtitle">
              Todos os desenvolvedores pausaram seus timers 🎉
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        <div>
          Última atualização: {lastUpdate.toLocaleTimeString()}
        </div>
        <div>
          Próxima: {nextUpdateIn}s
        </div>
      </div>
    </div>
  );
};

export default TimerDashboard;
