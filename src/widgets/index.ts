/**
 * Widget Registry - Central hub for all timer dashboard widgets
 * Manages widget initialization, configuration, and lifecycle
 */

import React from 'react';
import TimerDashboard from './timer-dashboard/TimerDashboard';
import TimerAnalytics from './timer-analytics/TimerAnalytics';
import UserTimer from './user-timer/UserTimer';
import ProjectDashboard from './project-dashboard/ProjectDashboard';

export interface WidgetConfig {
  key: string;
  name: string;
  description: string;
  component: React.ComponentType<any>;
  defaultProps: Record<string, any>;
  permissions: string[];
  extensionPoint: string;
  dimensions: {
    width: string | number;
    height: string | number;
  };
}

export const WIDGET_REGISTRY: Record<string, WidgetConfig> = {
  'timer-dashboard-global': {
    key: 'timer-dashboard-global',
    name: 'Timer Dashboard Global',
    description: 'Widget global para dashboards com timers ativos de toda organização',
    component: TimerDashboard,
    defaultProps: {
      refreshInterval: 30000,
      showUsers: true,
      showProjects: true,
      maxItems: 50,
      sortBy: 'time'
    },
    permissions: ['READ_ISSUE', 'READ_PROJECT', 'PRIVATE_READ_ISSUE', 'READ_USER'],
    extensionPoint: 'DASHBOARD_WIDGET',
    dimensions: {
      width: '8fr',
      height: '4fr'
    }
  },

  'timer-analytics-advanced': {
    key: 'timer-analytics-advanced',
    name: 'Timer Analytics Avançado',
    description: 'Dashboard completo com gráficos e insights de produtividade',
    component: TimerAnalytics,
    defaultProps: {
      refreshInterval: 60000,
      showProjectBreakdown: true,
      showUserBreakdown: true,
      showTrends: true,
      timeRange: 'day'
    },
    permissions: ['READ_ISSUE', 'READ_PROJECT', 'PRIVATE_READ_ISSUE', 'READ_USER'],
    extensionPoint: 'DASHBOARD_WIDGET',
    dimensions: {
      width: '12fr',
      height: '6fr'
    }
  },

  'user-timer-widget': {
    key: 'user-timer-widget',
    name: 'Meus Timers',
    description: 'Widget pessoal para monitoramento individual de timers',
    component: UserTimer,
    defaultProps: {
      refreshInterval: 30000,
      showQuickActions: true,
      compactMode: false
    },
    permissions: ['READ_ISSUE', 'READ_PROJECT', 'PRIVATE_READ_ISSUE'],
    extensionPoint: 'DASHBOARD_WIDGET',
    dimensions: {
      width: '6fr',
      height: '4fr'
    }
  },

  'user-timer-compact': {
    key: 'user-timer-compact',
    name: 'Meus Timers (Compacto)',
    description: 'Versão compacta do widget pessoal',
    component: UserTimer,
    defaultProps: {
      refreshInterval: 30000,
      showQuickActions: false,
      compactMode: true
    },
    permissions: ['READ_ISSUE', 'READ_PROJECT', 'PRIVATE_READ_ISSUE'],
    extensionPoint: 'DASHBOARD_WIDGET',
    dimensions: {
      width: '4fr',
      height: '3fr'
    }
  },

  'project-dashboard-widget': {
    key: 'project-dashboard-widget',
    name: 'Dashboard do Projeto',
    description: 'Visão completa dos timers e equipe por projeto',
    component: ProjectDashboard,
    defaultProps: {
      refreshInterval: 45000,
      showTeamBreakdown: true,
      showIssueBreakdown: true,
      showTrends: true
    },
    permissions: ['READ_ISSUE', 'READ_PROJECT', 'PRIVATE_READ_ISSUE', 'READ_USER'],
    extensionPoint: 'PROJECT_SETTINGS',
    dimensions: {
      width: 800,
      height: 600
    }
  },

  'timer-dashboard-simple': {
    key: 'timer-dashboard-simple',
    name: 'Timer Dashboard Simples',
    description: 'Versão compacta do dashboard para espaços menores',
    component: TimerDashboard,
    defaultProps: {
      refreshInterval: 30000,
      showUsers: false,
      showProjects: false,
      maxItems: 20,
      sortBy: 'time',
      compactMode: true
    },
    permissions: ['READ_ISSUE', 'READ_PROJECT', 'PRIVATE_READ_ISSUE'],
    extensionPoint: 'DASHBOARD_WIDGET',
    dimensions: {
      width: '4fr',
      height: '3fr'
    }
  }
};

/**
 * Widget Factory - Creates widget instances with proper configuration
 */
export class WidgetFactory {
  static createWidget(widgetKey: string, customProps: Record<string, any> = {}) {
    const config = WIDGET_REGISTRY[widgetKey];

    if (!config) {
      throw new Error(`Widget not found: ${widgetKey}`);
    }

    const props = {
      ...config.defaultProps,
      ...customProps
    };

    return React.createElement(config.component, props);
  }

  static getWidgetConfig(widgetKey: string): WidgetConfig | null {
    return WIDGET_REGISTRY[widgetKey] || null;
  }

  static getAllWidgets(): WidgetConfig[] {
    return Object.values(WIDGET_REGISTRY);
  }

  static getWidgetsByExtensionPoint(extensionPoint: string): WidgetConfig[] {
    return Object.values(WIDGET_REGISTRY).filter(
      widget => widget.extensionPoint === extensionPoint
    );
  }

  static validatePermissions(widgetKey: string, availablePermissions: string[]): boolean {
    const config = WIDGET_REGISTRY[widgetKey];

    if (!config) {
      return false;
    }

    return config.permissions.every(permission =>
      availablePermissions.includes(permission)
    );
  }
}

/**
 * Widget Manager - Handles widget lifecycle and state management
 */
export class WidgetManager {
  private static instances = new Map<string, any>();
  private static configurations = new Map<string, Record<string, any>>();

  static registerWidget(widgetKey: string, instance: any, config: Record<string, any> = {}) {
    this.instances.set(widgetKey, instance);
    this.configurations.set(widgetKey, config);
  }

  static unregisterWidget(widgetKey: string) {
    this.instances.delete(widgetKey);
    this.configurations.delete(widgetKey);
  }

  static getWidget(widgetKey: string) {
    return this.instances.get(widgetKey);
  }

  static getWidgetConfig(widgetKey: string) {
    return this.configurations.get(widgetKey);
  }

  static getAllInstances() {
    return Array.from(this.instances.entries());
  }

  static refreshWidget(widgetKey: string) {
    const instance = this.instances.get(widgetKey);
    if (instance && typeof instance.refresh === 'function') {
      instance.refresh();
    }
  }

  static refreshAllWidgets() {
    this.instances.forEach((instance, key) => {
      this.refreshWidget(key);
    });
  }

  static updateWidgetConfig(widgetKey: string, newConfig: Record<string, any>) {
    const currentConfig = this.configurations.get(widgetKey) || {};
    const updatedConfig = { ...currentConfig, ...newConfig };
    this.configurations.set(widgetKey, updatedConfig);

    const instance = this.instances.get(widgetKey);
    if (instance && typeof instance.updateConfig === 'function') {
      instance.updateConfig(updatedConfig);
    }
  }
}

/**
 * Widget Utilities - Helper functions for widget development
 */
export const WidgetUtils = {
  /**
   * Get YouTrack context from global YT object
   */
  getYouTrackContext() {
    if (typeof window !== 'undefined' && (window as any).YT) {
      const YT = (window as any).YT;
      return {
        host: YT.host,
        user: YT.user,
        project: YT.project,
        permissions: YT.permissions || []
      };
    }
    return null;
  },

  /**
   * Format duration for display
   */
  formatDuration(ms: number, options: { precision?: 'high' | 'low' } = {}) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (options.precision === 'high') {
      const remainingMinutes = minutes % 60;
      const remainingSeconds = seconds % 60;
      return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    }

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }

    return `${minutes}m`;
  },

  /**
   * Check if widget has required permissions
   */
  hasPermissions(widgetKey: string): boolean {
    const context = this.getYouTrackContext();
    if (!context) return false;

    return WidgetFactory.validatePermissions(widgetKey, context.permissions);
  },

  /**
   * Create widget error boundary
   */
  createErrorBoundary(fallback: React.ComponentType) {
    return class extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
      constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
      }

      static getDerivedStateFromError() {
        return { hasError: true };
      }

      componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Widget error:', error, errorInfo);
      }

      render() {
        if (this.state.hasError) {
          return React.createElement(fallback);
        }

        return this.props.children;
      }
    };
  }
};

export default {
  WidgetFactory,
  WidgetManager,
  WidgetUtils,
  WIDGET_REGISTRY
};