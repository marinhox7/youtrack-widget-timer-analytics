/**
 * Performance Optimization System
 * Provides comprehensive performance monitoring, optimization, and analytics
 */

import { Logger } from './logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percentage';
  timestamp: number;
  category: 'render' | 'api' | 'cache' | 'memory' | 'network';
  tags?: Record<string, string>;
}

export interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
}

export interface OptimizationSuggestion {
  type: 'render' | 'api' | 'cache' | 'memory' | 'bundle';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  suggestion: string;
  automated?: boolean;
}

/**
 * Performance Monitor - Tracks and analyzes performance metrics
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private thresholds: PerformanceThreshold[] = [];
  private logger = Logger.getLogger('PerformanceMonitor');
  private observers: PerformanceObserver[] = [];

  private constructor() {
    this.setupDefaultThresholds();
    this.initializeObservers();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private setupDefaultThresholds() {
    this.thresholds = [
      { metric: 'render_time', warning: 16, critical: 50 }, // 60fps = 16ms per frame
      { metric: 'api_response_time', warning: 1000, critical: 3000 },
      { metric: 'cache_hit_ratio', warning: 70, critical: 50 },
      { metric: 'bundle_size', warning: 1000000, critical: 2000000 }, // 1MB warning, 2MB critical
      { metric: 'memory_usage', warning: 50000000, critical: 100000000 }, // 50MB warning, 100MB critical
      { metric: 'network_requests', warning: 10, critical: 20 }
    ];
  }

  private initializeObservers() {
    if (typeof window === 'undefined' || !window.PerformanceObserver) {
      return;
    }

    try {
      // Observe Long Tasks
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.recordMetric({
            name: 'long_task',
            value: entry.duration,
            unit: 'ms',
            timestamp: Date.now(),
            category: 'render',
            tags: { type: entry.entryType }
          });

          if (entry.duration > 50) {
            this.logger.warn('Long task detected', {
              duration: entry.duration,
              startTime: entry.startTime
            });
          }
        });
      });

      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.push(longTaskObserver);

      // Observe Layout Shifts
      const layoutShiftObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          this.recordMetric({
            name: 'layout_shift',
            value: entry.value,
            unit: 'count',
            timestamp: Date.now(),
            category: 'render'
          });
        });
      });

      layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(layoutShiftObserver);

    } catch (error) {
      this.logger.error('Failed to initialize performance observers', error as Error);
    }
  }

  recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);

    // Keep only last 1000 metrics to prevent memory leaks
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Check thresholds
    this.checkThresholds(metric);

    this.logger.debug('Performance metric recorded', metric);
  }

  private checkThresholds(metric: PerformanceMetric) {
    const threshold = this.thresholds.find(t => t.metric === metric.name);
    if (!threshold) return;

    if (metric.value >= threshold.critical) {
      this.logger.error('Critical performance threshold exceeded', null, {
        metric: metric.name,
        value: metric.value,
        threshold: threshold.critical
      });
    } else if (metric.value >= threshold.warning) {
      this.logger.warn('Performance threshold warning', {
        metric: metric.name,
        value: metric.value,
        threshold: threshold.warning
      });
    }
  }

  getMetrics(category?: string, since?: number): PerformanceMetric[] {
    let filtered = this.metrics;

    if (category) {
      filtered = filtered.filter(m => m.category === category);
    }

    if (since) {
      filtered = filtered.filter(m => m.timestamp >= since);
    }

    return filtered;
  }

  getAverageMetric(name: string, since?: number): number {
    const metrics = this.getMetrics(undefined, since).filter(m => m.name === name);
    if (metrics.length === 0) return 0;

    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  }

  generateReport(): PerformanceReport {
    const now = Date.now();
    const lastHour = now - (60 * 60 * 1000);

    return {
      timestamp: now,
      renderMetrics: {
        averageRenderTime: this.getAverageMetric('render_time', lastHour),
        longTaskCount: this.getMetrics('render', lastHour).filter(m => m.name === 'long_task').length,
        layoutShifts: this.getMetrics('render', lastHour).filter(m => m.name === 'layout_shift').length
      },
      apiMetrics: {
        averageResponseTime: this.getAverageMetric('api_response_time', lastHour),
        requestCount: this.getMetrics('api', lastHour).length,
        errorRate: this.getMetrics('api', lastHour).filter(m => m.tags?.error === 'true').length
      },
      cacheMetrics: {
        hitRatio: this.getAverageMetric('cache_hit_ratio', lastHour),
        size: this.getAverageMetric('cache_size', lastHour)
      },
      memoryMetrics: {
        usage: this.getAverageMetric('memory_usage', lastHour),
        peak: Math.max(...this.getMetrics('memory', lastHour).map(m => m.value))
      },
      suggestions: this.generateOptimizationSuggestions()
    };
  }

  private generateOptimizationSuggestions(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const lastHour = Date.now() - (60 * 60 * 1000);

    // Check render performance
    const avgRenderTime = this.getAverageMetric('render_time', lastHour);
    if (avgRenderTime > 16) {
      suggestions.push({
        type: 'render',
        severity: avgRenderTime > 50 ? 'critical' : 'medium',
        title: 'Slow Render Performance',
        description: `Average render time is ${avgRenderTime.toFixed(2)}ms`,
        impact: 'Users may experience laggy interactions',
        suggestion: 'Consider using React.memo, useMemo, or useCallback for expensive operations',
        automated: false
      });
    }

    // Check API performance
    const avgApiTime = this.getAverageMetric('api_response_time', lastHour);
    if (avgApiTime > 1000) {
      suggestions.push({
        type: 'api',
        severity: avgApiTime > 3000 ? 'critical' : 'medium',
        title: 'Slow API Responses',
        description: `Average API response time is ${avgApiTime.toFixed(0)}ms`,
        impact: 'Slow data loading affects user experience',
        suggestion: 'Implement request debouncing, caching, or pagination',
        automated: true
      });
    }

    // Check cache performance
    const cacheHitRatio = this.getAverageMetric('cache_hit_ratio', lastHour);
    if (cacheHitRatio < 70) {
      suggestions.push({
        type: 'cache',
        severity: cacheHitRatio < 50 ? 'high' : 'medium',
        title: 'Low Cache Hit Ratio',
        description: `Cache hit ratio is ${cacheHitRatio.toFixed(1)}%`,
        impact: 'More API requests than necessary',
        suggestion: 'Review cache TTL settings and cache key strategy',
        automated: true
      });
    }

    // Check bundle size
    const bundleSize = this.getAverageMetric('bundle_size');
    if (bundleSize > 1000000) {
      suggestions.push({
        type: 'bundle',
        severity: bundleSize > 2000000 ? 'critical' : 'medium',
        title: 'Large Bundle Size',
        description: `Bundle size is ${(bundleSize / 1000000).toFixed(1)}MB`,
        impact: 'Slower initial page load',
        suggestion: 'Consider code splitting, tree shaking, or removing unused dependencies',
        automated: false
      });
    }

    return suggestions;
  }

  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.metrics = [];
  }
}

/**
 * Performance Decorators for automatic monitoring
 */
export function measurePerformance(category: PerformanceMetric['category'] = 'api') {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const monitor = PerformanceMonitor.getInstance();

    descriptor.value = async function (...args: any[]) {
      const startTime = performance.now();
      let error = false;

      try {
        const result = await method.apply(this, args);
        return result;
      } catch (err) {
        error = true;
        throw err;
      } finally {
        const endTime = performance.now();
        const duration = endTime - startTime;

        monitor.recordMetric({
          name: `${propertyName}_time`,
          value: duration,
          unit: 'ms',
          timestamp: Date.now(),
          category,
          tags: {
            method: propertyName,
            error: error.toString()
          }
        });
      }
    };

    return descriptor;
  };
}

/**
 * React Performance Hooks
 */
import React from 'react';

export function usePerformanceMonitor(componentName: string) {
  const monitor = PerformanceMonitor.getInstance();

  React.useEffect(() => {
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;

      monitor.recordMetric({
        name: 'component_render_time',
        value: renderTime,
        unit: 'ms',
        timestamp: Date.now(),
        category: 'render',
        tags: { component: componentName }
      });
    };
  });

  const measureRender = React.useCallback((operationName: string) => {
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      monitor.recordMetric({
        name: 'render_operation',
        value: duration,
        unit: 'ms',
        timestamp: Date.now(),
        category: 'render',
        tags: {
          component: componentName,
          operation: operationName
        }
      });
    };
  }, [componentName, monitor]);

  return { measureRender };
}

/**
 * Performance Report Interface
 */
export interface PerformanceReport {
  timestamp: number;
  renderMetrics: {
    averageRenderTime: number;
    longTaskCount: number;
    layoutShifts: number;
  };
  apiMetrics: {
    averageResponseTime: number;
    requestCount: number;
    errorRate: number;
  };
  cacheMetrics: {
    hitRatio: number;
    size: number;
  };
  memoryMetrics: {
    usage: number;
    peak: number;
  };
  suggestions: OptimizationSuggestion[];
}

/**
 * Memory Monitor - Tracks memory usage and detects leaks
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private logger = Logger.getLogger('MemoryMonitor');
  private monitor = PerformanceMonitor.getInstance();

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  startMonitoring() {
    if (typeof window === 'undefined' || !('memory' in performance)) {
      this.logger.warn('Memory API not available');
      return;
    }

    setInterval(() => {
      const memory = (performance as any).memory;

      this.monitor.recordMetric({
        name: 'memory_usage',
        value: memory.usedJSHeapSize,
        unit: 'bytes',
        timestamp: Date.now(),
        category: 'memory'
      });

      this.monitor.recordMetric({
        name: 'memory_total',
        value: memory.totalJSHeapSize,
        unit: 'bytes',
        timestamp: Date.now(),
        category: 'memory'
      });

      this.monitor.recordMetric({
        name: 'memory_limit',
        value: memory.jsHeapSizeLimit,
        unit: 'bytes',
        timestamp: Date.now(),
        category: 'memory'
      });

      // Check for potential memory leaks
      if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.8) {
        this.logger.warn('High memory usage detected', {
          used: memory.usedJSHeapSize,
          limit: memory.jsHeapSizeLimit,
          percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
        });
      }

    }, 30000); // Check every 30 seconds
  }
}

/**
 * Bundle Analyzer - Analyzes bundle size and dependencies
 */
export class BundleAnalyzer {
  private static instance: BundleAnalyzer;
  private logger = Logger.getLogger('BundleAnalyzer');

  static getInstance(): BundleAnalyzer {
    if (!BundleAnalyzer.instance) {
      BundleAnalyzer.instance = new BundleAnalyzer();
    }
    return BundleAnalyzer.instance;
  }

  analyzeDependencies() {
    if (typeof window === 'undefined') return;

    // Estimate bundle size from scripts
    const scripts = Array.from(document.scripts);
    let totalSize = 0;

    scripts.forEach(script => {
      if (script.src) {
        // This is a rough estimation - in real implementation,
        // you'd want to use webpack bundle analyzer or similar
        fetch(script.src, { method: 'HEAD' })
          .then(response => {
            const size = parseInt(response.headers.get('content-length') || '0');
            totalSize += size;

            PerformanceMonitor.getInstance().recordMetric({
              name: 'bundle_size',
              value: totalSize,
              unit: 'bytes',
              timestamp: Date.now(),
              category: 'network'
            });
          })
          .catch(() => {
            // Ignore errors for cross-origin requests
          });
      }
    });
  }
}

export default {
  PerformanceMonitor,
  MemoryMonitor,
  BundleAnalyzer,
  measurePerformance,
  usePerformanceMonitor
};