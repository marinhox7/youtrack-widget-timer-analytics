/**
 * Advanced Notification System
 * Provides toast notifications, alerts, and real-time updates
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Logger } from '../services/logger';
import './NotificationSystem.css';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  duration?: number;
  persistent?: boolean;
  actions?: Array<{
    label: string;
    onClick: () => void;
    primary?: boolean;
  }>;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  updateNotification: (id: string, updates: Partial<Notification>) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const logger = Logger.getLogger('NotificationSystem');

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: Date.now(),
      duration: notification.duration ?? (notification.type === 'error' ? 0 : 5000)
    };

    setNotifications(prev => [newNotification, ...prev]);

    logger.info('Notification added', {
      id,
      type: notification.type,
      title: notification.title
    });

    // Auto-remove non-persistent notifications
    if (!notification.persistent && newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  }, [logger]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    logger.debug('Notification removed', { id });
  }, [logger]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    logger.info('All notifications cleared');
  }, [logger]);

  const updateNotification = useCallback((id: string, updates: Partial<Notification>) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, ...updates } : n)
    );
  }, []);

  const contextValue = useMemo(() => ({
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    updateNotification
  }), [notifications, addNotification, removeNotification, clearAll, updateNotification]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
};

const NotificationContainer: React.FC = () => {
  const { notifications } = useNotifications();

  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
        />
      ))}
    </div>
  );
};

const NotificationItem: React.FC<{ notification: Notification }> = ({ notification }) => {
  const { removeNotification } = useNotifications();
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleRemove = useCallback(() => {
    setIsLeaving(true);
    setTimeout(() => {
      removeNotification(notification.id);
    }, 300); // Match CSS animation duration
  }, [notification.id, removeNotification]);

  const getIcon = () => {
    switch (notification.type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'critical': return '🚨';
      default: return 'ℹ️';
    }
  };

  const notificationClass = `notification-item ${notification.type} ${isVisible ? 'visible' : ''} ${isLeaving ? 'leaving' : ''}`;

  return (
    <div className={notificationClass}>
      <div className="notification-icon">
        {getIcon()}
      </div>
      <div className="notification-content">
        <div className="notification-title">{notification.title}</div>
        <div className="notification-message">{notification.message}</div>
        {notification.actions && notification.actions.length > 0 && (
          <div className="notification-actions">
            {notification.actions.map((action, index) => (
              <button
                key={index}
                className={`notification-action ${action.primary ? 'primary' : ''}`}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="notification-close" onClick={handleRemove}>
        ×
      </button>
    </div>
  );
};

// Hook for creating timer-specific notifications
export const useTimerNotifications = () => {
  const { addNotification } = useNotifications();

  const notifyTimerCritical = useCallback((timerData: { issueKey: string; username: string; duration: string }) => {
    return addNotification({
      type: 'critical',
      title: 'Timer Crítico Detectado',
      message: `Timer de ${timerData.username} em ${timerData.issueKey} está ativo há ${timerData.duration}`,
      persistent: true,
      actions: [
        {
          label: 'Ver Detalhes',
          onClick: () => {
            // Navigate to timer details
            console.log('Navigate to timer details', timerData);
          },
          primary: true
        },
        {
          label: 'Marcar como Visto',
          onClick: () => {
            // Mark as seen
            console.log('Mark as seen', timerData);
          }
        }
      ]
    });
  }, [addNotification]);

  const notifyTimerStarted = useCallback((timerData: { issueKey: string; username: string }) => {
    return addNotification({
      type: 'info',
      title: 'Novo Timer Iniciado',
      message: `${timerData.username} iniciou timer em ${timerData.issueKey}`,
      duration: 3000
    });
  }, [addNotification]);

  const notifyTimerStopped = useCallback((timerData: { issueKey: string; username: string; duration: string }) => {
    return addNotification({
      type: 'success',
      title: 'Timer Finalizado',
      message: `${timerData.username} finalizou timer em ${timerData.issueKey} após ${timerData.duration}`,
      duration: 4000
    });
  }, [addNotification]);

  const notifyApiError = useCallback((error: string) => {
    return addNotification({
      type: 'error',
      title: 'Erro de Conexão',
      message: `Falha ao conectar com YouTrack: ${error}`,
      persistent: true,
      actions: [
        {
          label: 'Tentar Novamente',
          onClick: () => {
            window.location.reload();
          },
          primary: true
        }
      ]
    });
  }, [addNotification]);

  const notifyDataRefresh = useCallback(() => {
    return addNotification({
      type: 'success',
      title: 'Dados Atualizados',
      message: 'Os dados dos timers foram atualizados com sucesso',
      duration: 2000
    });
  }, [addNotification]);

  return {
    notifyTimerCritical,
    notifyTimerStarted,
    notifyTimerStopped,
    notifyApiError,
    notifyDataRefresh
  };
};

// Real-time notification service
export class RealTimeNotificationService {
  private static instance: RealTimeNotificationService;
  private logger = Logger.getLogger('RealTimeNotificationService');
  private notificationCallback?: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;

  static getInstance(): RealTimeNotificationService {
    if (!RealTimeNotificationService.instance) {
      RealTimeNotificationService.instance = new RealTimeNotificationService();
    }
    return RealTimeNotificationService.instance;
  }

  setNotificationCallback(callback: (notification: Omit<Notification, 'id' | 'timestamp'>) => void) {
    this.notificationCallback = callback;
  }

  // Simulate real-time events (in real implementation, this would connect to WebSocket or SSE)
  startMonitoring() {
    // Mock real-time timer events
    setInterval(() => {
      if (Math.random() < 0.1 && this.notificationCallback) { // 10% chance every interval
        const mockEvents = [
          {
            type: 'warning' as const,
            title: 'Timer de Longa Duração',
            message: 'Timer de joão.silva em PROJ-123 está ativo há mais de 4 horas',
            duration: 8000
          },
          {
            type: 'info' as const,
            title: 'Novo Timer Iniciado',
            message: 'maria.santos iniciou timer em PROJ-456',
            duration: 3000
          },
          {
            type: 'success' as const,
            title: 'Meta Atingida',
            message: 'Equipe completou 95% dos timers hoje',
            duration: 5000
          }
        ];

        const randomEvent = mockEvents[Math.floor(Math.random() * mockEvents.length)];
        this.notificationCallback(randomEvent);

        this.logger.debug('Real-time notification triggered', randomEvent);
      }
    }, 30000); // Check every 30 seconds
  }

  stopMonitoring() {
    // In real implementation, cleanup WebSocket connections
    this.logger.info('Real-time monitoring stopped');
  }
}

export default {
  NotificationProvider,
  useNotifications,
  useTimerNotifications,
  RealTimeNotificationService
};