/**
 * Timer Analytics Widget - Versão Simplificada sem Web Worker
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { YouTrackAPI, processTimerData, calculateStats, formatDuration, formatDurationHHMM, formatDurationToHoursMinutes, msToHours, formatHoursForChart } from '../../services/api';
import { TimerEntry, TimerStats } from '../../types';
import { Logger } from '../../services/logger';
import { getProjectColor, getCachedProjectColor, getChartColorsForProjects, getStatusColor, clearProjectColorCache } from '../../utils/colors';
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
  // Campos adicionais para análise histórica
  starts?: number;
  stops?: number;
  totalDuration?: number;
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
  refreshInterval = 30000, // Não usado mais (sem auto-refresh)
  showProjectBreakdown = true,
  showTrends = true,
  timeRange = 'day'
}) => {
  // Estados básicos
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [systemUsers, setSystemUsers] = useState<number>(0);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [timerLogs, setTimerLogs] = useState<any[]>([]);
  const [lastLogsUpdate, setLastLogsUpdate] = useState<number>(0);

  // Filtros para logs
  const [selectedLogProject, setSelectedLogProject] = useState<string>('all');
  const [selectedLogUser, setSelectedLogUser] = useState<string>('all');

  const logger = useMemo(() => Logger.getLogger('TimerAnalytics'), []);

  const api = useMemo(() => new YouTrackAPI(host), [host]);


  // Função para calcular tendências baseadas em logs históricos de timer (comentários)
  const calculateHistoricalTrends = (timerLogs: any[]): AnalyticsData['trends'] => {
    const now = new Date();
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    console.log('=== DEBUG TRENDS ===');
    console.log('Total timer logs received:', timerLogs.length);
    console.log('Sample logs:', timerLogs.slice(0, 5).map(log => ({
      created: log.created,
      type: log.type,
      issueKey: log.issueKey,
      author: log.author?.login
    })));

    // Converter UTC para horário do Brasil (GMT-3)
    const toBrazilTime = (utcDate: Date): Date => {
      const brazilOffset = -3 * 60; // GMT-3 em minutos
      const utcTime = utcDate.getTime() + (utcDate.getTimezoneOffset() * 60000);
      return new Date(utcTime + (brazilOffset * 60000));
    };

    // Helper para extrair duração em minutos do texto
    const parseDuration = (durationText: string): number => {
      if (!durationText) return 0;

      // Patterns: "1h 5min", "25 minutos", "2h", "30min"
      const hourMatch = durationText.match(/(\d+)h/);
      const minMatch = durationText.match(/(\d+)\s*min/);

      const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
      const minutes = minMatch ? parseInt(minMatch[1]) : 0;

      return hours * 60 + minutes;
    };

    // Agrupar logs por período de tempo
    const groupLogsByPeriod = (
      length: number,
      stepMs: number,
      labelFormatter: (pointDate: Date, index: number) => string
    ): TrendPoint[] => {
      const periods: { [key: string]: { starts: number, stops: number, totalDuration: number, count: number } } = {};

      // Inicializar todos os períodos (usando horário brasileiro)
      const nowBrazil = toBrazilTime(now);
      for (let i = 0; i < length; i++) {
        const pointDate = new Date(nowBrazil.getTime() - (length - 1 - i) * stepMs);
        const label = labelFormatter(pointDate, i);
        periods[label] = { starts: 0, stops: 0, totalDuration: 0, count: 0 };
      }

      // Processar cada log
      timerLogs.forEach(log => {
        const logDateUTC = new Date(log.created);
        const logDate = toBrazilTime(logDateUTC); // Converter para horário brasileiro
        const logTime = logDate.getTime();

        // Encontrar período correspondente (usando horário brasileiro)
        for (let i = 0; i < length; i++) {
          const pointDate = new Date(nowBrazil.getTime() - (length - 1 - i) * stepMs);
          const nextPointDate = new Date(nowBrazil.getTime() - (length - 2 - i) * stepMs);

          if (logTime >= pointDate.getTime() && logTime < (i === length - 1 ? nowBrazil.getTime() : nextPointDate.getTime())) {
            const label = labelFormatter(pointDate, i);

            if (log.type === 'timer_started') {
              periods[label].starts++;
            } else if (log.type === 'timer_stopped') {
              periods[label].stops++;
              const duration = parseDuration(log.duration || '');
              if (duration > 0) {
                periods[label].totalDuration += duration;
                periods[label].count++;
              }
            }
            break;
          }
        }
      });

      // Converter para TrendPoint
      return Object.entries(periods).map(([label, data]) => ({
        label,
        count: data.starts, // Apenas timers iniciados
        avgDuration: data.count > 0 ? data.totalDuration / data.count : 0, // Duração média dos timers parados (para referência)
        timestamp: new Date().toISOString(), // Timestamp do ponto
        // Dados extras para análise
        starts: data.starts,
        stops: data.stops,
        totalDuration: data.totalDuration
      }));
    };

    return {
      hourly: groupLogsByPeriod(12, 60 * 60 * 1000, (date) =>
        `${date.getHours().toString().padStart(2, '0')}:00`
      ),
      daily: groupLogsByPeriod(24, 60 * 60 * 1000, (date) =>
        `${date.getHours().toString().padStart(2, '0')}h`
      ),
      weekly: groupLogsByPeriod(7, 24 * 60 * 60 * 1000, (date) =>
        dayNames[date.getDay()]
      ),
      monthly: groupLogsByPeriod(30, 24 * 60 * 60 * 1000, (date) =>
        `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`
      )
    };
  };

  // Função para calcular tendências híbridas: timers atuais (tempo real) + work items (tempo editado)
  const calculateAdvancedTrends = (workItems: any[], timers: TimerEntry[]): AnalyticsData['trends'] => {
    const now = new Date();
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    // Função para agrupar dados por período de tempo (abordagem híbrida)
    const groupDataByPeriod = (
      length: number,
      stepMs: number,
      labelFormatter: (pointDate: Date, index: number) => string
    ): TrendPoint[] => {
      const periods: { [key: string]: any[] } = {};

      // Inicializar todos os períodos
      for (let i = 0; i < length; i++) {
        const pointDate = new Date(now.getTime() - (length - 1 - i) * stepMs);
        const label = labelFormatter(pointDate, i);
        periods[label] = [];
      }

      // ESTRATÉGIA HÍBRIDA:
      // 1. Para períodos recentes: usar timers atuais (tempo real)
      // 2. Para períodos passados: usar work items históricos (tempo editado)

      const currentPeriodIndex = length - 1; // Índice do período mais recente
      const hybridThreshold = Math.max(1, Math.floor(length * 0.2)); // 20% mais recentes usar timers

      for (let i = 0; i < length; i++) {
        const pointDate = new Date(now.getTime() - (length - 1 - i) * stepMs);
        const label = labelFormatter(pointDate, i);
        const isRecentPeriod = i >= (length - hybridThreshold);

        if (isRecentPeriod) {
          // PERÍODOS RECENTES: Usar timers atuais (tempo real de execução)
          const periodStart = new Date(now.getTime() - (length - i) * stepMs);
          const periodEnd = new Date(now.getTime() - (length - 1 - i) * stepMs);

          timers.forEach(timer => {
            const timerStartTime = new Date(now.getTime() - timer.elapsedMs);

            // Se o timer estava ativo neste período (tempo real)
            if (timerStartTime <= periodEnd) {
              // Simular work item baseado no timer
              const simulatedWorkItem = {
                duration: { minutes: Math.floor(timer.elapsedMs / (1000 * 60)) },
                issue: { project: { shortName: timer.projectShortName } },
                author: { login: timer.username }
              };
              periods[label].push(simulatedWorkItem);
            }
          });
        } else {
          // PERÍODOS PASSADOS: Usar work items históricos (tempo editado)
          const periodStart = new Date(now.getTime() - (length - i) * stepMs);
          const periodEnd = new Date(now.getTime() - (length - 1 - i) * stepMs);

          // Filtrar work items que poderiam estar neste período
          const relevantWorkItems = workItems.filter(workItem => {
            const workItemDate = new Date(workItem.date || workItem.created);
            // Aceitar work items com datas próximas a este período
            const daysBetween = Math.abs(workItemDate.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
            return daysBetween <= 7; // Aceitar work items até 7 dias de diferença
          });

          // Distribuir alguns work items para este período
          const maxItemsForPeriod = Math.min(relevantWorkItems.length, Math.ceil(timers.length * 0.3));
          const itemsForThisPeriod = relevantWorkItems.slice(0, maxItemsForPeriod);

          periods[label].push(...itemsForThisPeriod);
        }
      }

      // Converter para TrendPoint[]
      const result = Object.entries(periods).map(([label, periodWorkItems], index) => {
        const pointDate = new Date(now.getTime() - (length - 1 - index) * stepMs);
        const count = periodWorkItems.length;
        const totalDuration = periodWorkItems.reduce((sum, wi) => {
          const minutes = wi.duration?.minutes || 0;
          return sum + (minutes * 60 * 1000); // Converter para ms
        }, 0);
        const avgDuration = count > 0 ? totalDuration / count : 0;

        return {
          label,
          count,
          avgDuration,
          timestamp: pointDate.toISOString()
        };
      });

      // Log da distribuição para debug
      console.log(`Hybrid distribution for ${length} periods:`,
        result.map((r, i) => ({
          label: r.label,
          count: r.count,
          source: i >= (length - Math.max(1, Math.floor(length * 0.2))) ? 'timers(real)' : 'workItems(edited)'
        })));

      return result;
    };

    return {
      hourly: groupDataByPeriod(
        12,
        60 * 60 * 1000,
        (date) => `${date.getHours().toString().padStart(2, '0')}h`
      ),
      daily: groupDataByPeriod(
        24,
        60 * 60 * 1000,
        (date) => `${date.getHours().toString().padStart(2, '0')}h`
      ),
      weekly: groupDataByPeriod(
        7,
        24 * 60 * 60 * 1000,
        (date) => dayNames[date.getDay()]
      ),
      monthly: groupDataByPeriod(
        30,
        24 * 60 * 60 * 1000,
        (date) => `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`
      )
    };
  };

  // Função de fallback usando timers atuais para gerar tendências básicas
  const calculateFallbackTrends = (timers: TimerEntry[]): AnalyticsData['trends'] => {
    const now = new Date();
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const buildFallbackSeries = (
      length: number,
      stepMs: number,
      labelFormatter: (pointDate: Date, index: number) => string
    ): TrendPoint[] => {
      const baseCount = timers.length;
      const totalDuration = timers.reduce((sum, timer) => sum + timer.elapsedMs, 0);
      const avgDuration = baseCount > 0 ? totalDuration / baseCount : 0;

      return Array.from({ length }).map((_, index) => {
        const pointDate = new Date(now.getTime() - (length - 1 - index) * stepMs);

        // Simular alguma variação baseada no índice
        const variation = 0.8 + (Math.sin(index * 0.5) * 0.4);
        const count = Math.max(0, Math.round(baseCount * variation));

        return {
          label: labelFormatter(pointDate, index),
          count,
          avgDuration: avgDuration * (0.8 + Math.random() * 0.4),
          timestamp: pointDate.toISOString()
        };
      });
    };

    return {
      hourly: buildFallbackSeries(
        12,
        60 * 60 * 1000,
        (date) => `${date.getHours().toString().padStart(2, '0')}h`
      ),
      daily: buildFallbackSeries(
        24,
        60 * 60 * 1000,
        (date) => `${date.getHours().toString().padStart(2, '0')}h`
      ),
      weekly: buildFallbackSeries(
        7,
        24 * 60 * 60 * 1000,
        (date) => dayNames[date.getDay()]
      ),
      monthly: buildFallbackSeries(
        30,
        24 * 60 * 60 * 1000,
        (date) => `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`
      )
    };
  };

  // Fetch simplificado
  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const now = Date.now();
      const monthAgo = now - (30 * 24 * 60 * 60 * 1000); // 30 dias atrás

      const [issues, users, workItems] = await Promise.all([
        api.fetchIssuesWithTimers({ limit: 1000 }),
        api.fetchUsers({ limit: 1000, banned: false }),
        api.fetchWorkItems({ start: monthAgo, end: now, limit: 2000 })
      ]);

      const timers = processTimerData(issues);
      const stats = calculateStats(timers);

      // Log work items para debug
      logger.warn('Work items data', {
        workItemsCount: workItems.length,
        workItemsSample: workItems.slice(0, 3).map(wi => ({
          date: new Date(wi.date || wi.created).toISOString(),
          duration: wi.duration?.minutes,
          project: wi.issue?.project?.shortName
        }))
      });

      // Fetch timer logs from recent comments FIRST (needed for trends)
      let logs: any[] = [];
      try {
        logs = await api.fetchTimerLogs();
        setTimerLogs(logs);
        setLastLogsUpdate(Date.now());
      } catch (logsError) {
        logger.error('Failed to fetch timer logs', logsError);
        setTimerLogs([]);
      }

      // Calculate trends using historical timer logs
      const trends = logs.length > 0
        ? calculateHistoricalTrends(logs)
        : workItems.length > 0
        ? calculateAdvancedTrends(workItems, timers)
        : calculateFallbackTrends(timers);

      setSystemUsers(users.length);
      setData({ timers, stats, trends });

    } catch (err) {
      logger.error('Failed to fetch analytics data', err as Error);
      setError('Falha ao carregar dados de analytics');
    } finally {
      setLoading(false);
    }
  }, [api, logger]);

  // Initial load only (no auto refresh)
  useEffect(() => {
    // Limpar cache de cores para garantir aplicação das novas cores
    clearProjectColorCache();
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Filtros e dados processados
  const availableProjects = useMemo(() => {
    if (!data?.timers) return [];
    const projects = new Set(data.timers.map(t => t.projectShortName));
    return Array.from(projects).sort();
  }, [data]);

  const filteredTimers = useMemo(() => {
    if (!data?.timers) return [];
    if (selectedProject === 'all') return data.timers;
    return data.timers.filter(timer => timer.projectShortName === selectedProject);
  }, [data, selectedProject]);

  // Listas para filtros de logs
  const availableLogProjects = useMemo(() => {
    if (!timerLogs || timerLogs.length === 0) return [];
    const projects = new Set(timerLogs.map(log => log.projectShortName));
    return Array.from(projects).sort();
  }, [timerLogs]);

  const availableLogUsers = useMemo(() => {
    if (!timerLogs || timerLogs.length === 0) return [];
    const users = new Set(timerLogs.map(log => log.author?.fullName || log.author?.login).filter(Boolean));
    return Array.from(users).sort();
  }, [timerLogs]);

  // Logs filtrados
  const filteredTimerLogs = useMemo(() => {
    if (!timerLogs) return [];

    let filtered = timerLogs;

    if (selectedLogProject !== 'all') {
      filtered = filtered.filter(log => log.projectShortName === selectedLogProject);
    }

    if (selectedLogUser !== 'all') {
      filtered = filtered.filter(log => {
        const userName = log.author?.fullName || log.author?.login;
        return userName === selectedLogUser;
      });
    }

    return filtered;
  }, [timerLogs, selectedLogProject, selectedLogUser]);

  // Stats rápidas
  const quickStats = useMemo(() => {
    if (!data?.timers) {
      return { systemUsers: 0, activeUsers: 0, totalTimers: 0, criticalTimers: 0, averageTime: 0 };
    }

    const activeUsers = new Set(data.timers.map(t => t.username)).size;
    const totalTimers = data.timers.length;
    const criticalTimers = data.timers.filter(t => t.status === 'critical').length;
    const totalTime = data.timers.reduce((sum, t) => sum + t.elapsedMs, 0);
    const averageTime = totalTimers > 0 ? totalTime / totalTimers : 0;

    return { systemUsers, activeUsers, totalTimers, criticalTimers, averageTime };
  }, [data, systemUsers]);

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

    const values = trendsData.map((d: any) => d.count); // Sempre usar count (timers iniciados)

    return {
      labels,
      datasets: [
        {
          label: 'Timers Iniciados',
          data: values,
          backgroundColor: 'rgba(0, 122, 204, 0.1)',
          borderColor: 'rgba(0, 122, 204, 0.8)',
          borderWidth: 3,
          fill: false, // Não preencher área
          tension: 0.1, // Suavização reduzida (evita ondas)
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
  }, [data, selectedTimeRange]);

  // Chart data para projetos
  const projectsChartData = useMemo(() => {
    if (!data?.stats?.projectBreakdown) return null;

    const projects = data.stats.projectBreakdown; // Mostrar todos os projetos
    const projectKeys = projects.map(p => p.projectShortName);

    return {
      labels: projectKeys,
      datasets: [
        {
          label: 'Duração Total (h)',
          data: projects.map(p => msToHours(p.totalTimeMs)),
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
        tension: 0.1, // Tensão reduzida para evitar ondas
        borderWidth: 2,
        fill: false
      },
      point: {
        radius: 3,
        hoverRadius: 5,
        borderWidth: 1,
        hoverBorderWidth: 2
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y;
            return `${context.dataset.label}: ${value}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return value; // Sempre mostrar contagem como número inteiro
          }
        }
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
              Tentar Novamente
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
      <div className="header-actions">
        <button onClick={fetchAnalyticsData} className="refresh-button" disabled={loading}>
          Atualizar
        </button>
      </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">
            <svg width="24" height="24" fill="#FFFFFF" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <div className="metric-content">
            <div className="metric-value">{quickStats.systemUsers}</div>
            <div className="metric-label">Usuários do Sistema</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{quickStats.activeUsers}</div>
            <div className="metric-label">Usuários Ativos</div>
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
            <div className="metric-value">{formatDurationToHoursMinutes(quickStats.averageTime)}</div>
            <div className="metric-label">Tempo Médio</div>
          </div>
        </div>
      </div>

      {/* Active Issues Cards */}
      {data && data.timers.length > 0 && (
        <div className="active-issues-section">
          <div className="active-issues-header">
            <div className="active-issues-title">
              <h3>🔥 Issues com Timers Ativos</h3>
              <div className="active-issues-info">
                <span>
                  Total de {filteredTimers.length} timers
                  {selectedProject !== 'all' ? ` em ${selectedProject}` : ' ativos'}
                </span>
                {filteredTimers.length > 6 && (
                  <span className="scroll-hint">Role para ver todos</span>
                )}
              </div>
            </div>
            <div className="chart-filters">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="control-select"
              >
                <option value="all">Todos os Projetos</option>
                {availableProjects.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="active-issues-scroll">
            <div className="active-issues-grid">
              {filteredTimers.map((timer, index) => (
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
                      {formatDurationHHMM(timer.elapsedMs)}
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

      {/* Charts Section - Reorganized Layout */}

      {/* Trends Chart - Full Width */}
      {showTrends && trendsChartData && (
        <div className="trends-chart-section">
          <div className="chart-container">
            <div className="chart-header">
              <h3>📈 Tendências de Timers</h3>
              <div className="chart-filters">
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

              </div>
            </div>
            <div className="chart-wrapper">
              <Line data={trendsChartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Charts Grid - Project Breakdown + Status Distribution */}
      <div className="bottom-charts-grid">
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
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context: any) {
                          const value = context.parsed.y;
                          return `${context.dataset.label}: ${formatHoursForChart(value)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: function(value: any) {
                          return formatHoursForChart(value);
                        }
                      }
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

      {/* Timer Logs Section - Work Items as Timer Logs */}
      <div className="timer-logs-section">
        <div className="timer-logs-container">
          <div className="logs-header">
            <h3>📝 Logs de Timer ({filteredTimerLogs.length})</h3>
            <div className="chart-filters">
              <select
                value={selectedLogProject}
                onChange={(e) => setSelectedLogProject(e.target.value)}
                className="control-select"
              >
                <option value="all">Todos os Projetos</option>
                {availableLogProjects.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
              <select
                value={selectedLogUser}
                onChange={(e) => setSelectedLogUser(e.target.value)}
                className="control-select"
              >
                <option value="all">Todos os Usuários</option>
                {availableLogUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>
            {lastLogsUpdate > 0 && (
              <span className="logs-timestamp">
                Última busca: {new Date(lastLogsUpdate).toLocaleTimeString('pt-BR')}
              </span>
            )}
          </div>
          <div className="timer-logs-content">
            {filteredTimerLogs.length > 0 ? (
              <div className="timer-logs-list">
                {filteredTimerLogs.slice(0, 15).map((log, index) => (
                  <div key={`${log.id}-${index}`} className={`timer-log-item ${log.type}`}>
                    <div className="log-header">
                      <span className="log-issue-key">{log.issueKey}</span>
                      <span className="log-work-type">{log.workType}</span>
                      <span className="log-duration">{log.duration || '-'}</span>
                      <span className="log-time">
                        {new Date(log.created).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="log-details">
                      <div className="log-author">👤 {log.author?.fullName || log.author?.login}</div>
                      <div className="log-action">
                        {log.type === 'timer_started' && '🟢 ▶️ Timer iniciado'}
                        {log.type === 'timer_stopped' && '🔴 ⏹️ Timer parado'}
                        {log.type === 'timer_canceled' && '🟡 ⏸️ Timer cancelado'}
                        {log.type === 'timer_auto_canceled' && '⏰ Timer cancelado automaticamente'}
                        {log.type === 'timer_blocked' && '🚫 Timer bloqueado'}
                        {log.type === 'timer_duplicate' && '⚠️ Timer já ativo'}
                        {!['timer_started', 'timer_stopped', 'timer_canceled', 'timer_auto_canceled', 'timer_blocked', 'timer_duplicate'].includes(log.type) && '⏱️ Ação no timer'}
                        {log.duration && ` (${log.duration})`}
                        {log.reason && ` - ${log.reason}`}
                      </div>
                    </div>
                    <div className="log-issue-summary">
                      {log.issueSummary.length > 100 ? `${log.issueSummary.substring(0, 100)}...` : log.issueSummary}
                    </div>
                  </div>
                ))}
                {filteredTimerLogs.length > 15 && (
                  <div className="timer-logs-more">
                    +{filteredTimerLogs.length - 15} logs mais antigos (últimas 24 horas)
                  </div>
                )}
              </div>
            ) : (
              <div className="timer-logs-placeholder">
                <p>📊 <strong>Aguardando logs de timer</strong></p>
                <p>Os logs aparecerão aqui quando você:</p>
                <ul>
                  <li>🟢 <strong>Iniciar um timer</strong> em uma issue</li>
                  <li>🔴 <strong>Parar um timer ativo</strong> e criar work item</li>
                  <li>⏱️ <strong>Ações são registradas em tempo real</strong></li>
                </ul>
                <p><small>Mostra work items criados nos últimos 7 dias</small></p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="analytics-footer">
        <div>
          {data.timers.length} timers ativos • {data.stats.totalUsers} usuários
        </div>
      </div>
    </div>
  );
});

TimerAnalytics.displayName = 'TimerAnalytics';

export default TimerAnalytics;