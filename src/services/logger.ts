/**
 * Advanced Logging System for YouTrack Timer Dashboard
 * Provides structured logging with levels, formatting, and performance monitoring
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
  error?: Error;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  performance?: PerformanceMetrics;
}

export interface PerformanceMetrics {
  duration?: number; // milliseconds
  memoryUsage?: number; // bytes
  apiCallCount?: number;
  cacheHitRate?: number;
}

export interface LoggerConfig {
  level: LogLevel;
  enabled: boolean;
  console: boolean;
  structured: boolean;
  includeStackTrace: boolean;
  maxEntries: number;
  contexts: string[];
  performance: boolean;
}

/**
 * Advanced logger with structured logging and performance monitoring
 */
export class Logger {
  private logs: LogEntry[] = [];
  private performanceMarks: Map<string, number> = new Map();
  private static instances: Map<string, Logger> = new Map();

  constructor(
    private context: string,
    private config: LoggerConfig = {
      level: LogLevel.INFO,
      enabled: true,
      console: true,
      structured: true,
      includeStackTrace: false,
      maxEntries: 1000,
      contexts: [],
      performance: true
    }
  ) {}

  /**
   * Get logger instance for specific context
   */
  static getLogger(context: string, config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instances.has(context)) {
      const defaultConfig: LoggerConfig = {
        level: LogLevel.INFO,
        enabled: true,
        console: true,
        structured: true,
        includeStackTrace: false,
        maxEntries: 1000,
        contexts: [],
        performance: true
      };

      Logger.instances.set(context, new Logger(context, { ...defaultConfig, ...config }));
    }

    return Logger.instances.get(context)!;
  }

  /**
   * Debug level logging
   */
  debug(message: string, data?: any, requestId?: string): void {
    this.log(LogLevel.DEBUG, message, data, undefined, requestId);
  }

  /**
   * Info level logging
   */
  info(message: string, data?: any, requestId?: string): void {
    this.log(LogLevel.INFO, message, data, undefined, requestId);
  }

  /**
   * Warning level logging
   */
  warn(message: string, data?: any, requestId?: string): void {
    this.log(LogLevel.WARN, message, data, undefined, requestId);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error, data?: any, requestId?: string): void {
    this.log(LogLevel.ERROR, message, data, error, requestId);
  }

  /**
   * Fatal level logging
   */
  fatal(message: string, error?: Error, data?: any, requestId?: string): void {
    this.log(LogLevel.FATAL, message, data, error, requestId);
  }

  /**
   * Start performance measurement
   */
  startPerformance(label: string): void {
    if (!this.config.performance) return;

    this.performanceMarks.set(label, performance.now());
    console.time(`[${this.context}] ${label}`);
  }

  /**
   * End performance measurement and log result
   */
  endPerformance(label: string, message?: string, data?: any): number {
    if (!this.config.performance) return 0;

    const startTime = this.performanceMarks.get(label);
    if (!startTime) {
      this.warn(`Performance mark not found: ${label}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.performanceMarks.delete(label);

    console.timeEnd(`[${this.context}] ${label}`);

    const metrics: PerformanceMetrics = {
      duration,
      memoryUsage: this.getMemoryUsage()
    };

    this.log(
      LogLevel.INFO,
      message || `Performance: ${label}`,
      { ...data, metrics },
      undefined,
      undefined,
      metrics
    );

    return duration;
  }

  /**
   * Log API call with automatic performance tracking
   */
  async logApiCall<T>(
    label: string,
    apiCall: () => Promise<T>,
    data?: any,
    requestId?: string
  ): Promise<T> {
    this.startPerformance(`api_${label}`);
    this.info(`API Call Started: ${label}`, data, requestId);

    try {
      const result = await apiCall();
      const duration = this.endPerformance(`api_${label}`, `API Call Completed: ${label}`, data);

      this.info(`API Call Success: ${label}`, {
        ...data,
        duration: `${duration.toFixed(2)}ms`,
        success: true
      }, requestId);

      return result;
    } catch (error) {
      const duration = this.endPerformance(`api_${label}`, `API Call Failed: ${label}`, data);

      this.error(`API Call Error: ${label}`, error as Error, {
        ...data,
        duration: `${duration.toFixed(2)}ms`,
        success: false
      }, requestId);

      throw error;
    }
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    data?: any,
    error?: Error,
    requestId?: string,
    performance?: PerformanceMetrics
  ): void {
    if (!this.config.enabled || level < this.config.level) {
      return;
    }

    // Filter by context if specified
    if (this.config.contexts.length > 0 && !this.config.contexts.includes(this.context)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context: this.context,
      data,
      error,
      requestId,
      performance
    };

    // Add to internal log store
    this.logs.push(entry);

    // Maintain max entries limit
    if (this.logs.length > this.config.maxEntries) {
      this.logs = this.logs.slice(-this.config.maxEntries);
    }

    // Console output
    if (this.config.console) {
      this.outputToConsole(entry);
    }
  }

  /**
   * Output log entry to console with formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const levelName = LogLevel[entry.level];
    const prefix = `[${timestamp}] [${levelName}] [${entry.context}]`;

    if (this.config.structured) {
      // Structured output for development
      const logData = {
        timestamp: entry.timestamp,
        level: levelName,
        context: entry.context,
        message: entry.message,
        requestId: entry.requestId,
        data: entry.data,
        performance: entry.performance
      };

      if (entry.error) {
        logData.error = {
          name: entry.error.name,
          message: entry.error.message,
          stack: this.config.includeStackTrace ? entry.error.stack : undefined
        };
      }

      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(prefix, logData);
          break;
        case LogLevel.INFO:
          console.info(prefix, logData);
          break;
        case LogLevel.WARN:
          console.warn(prefix, logData);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(prefix, logData);
          break;
      }
    } else {
      // Simple text output
      let output = `${prefix} ${entry.message}`;

      if (entry.requestId) {
        output += ` [Request: ${entry.requestId}]`;
      }

      if (entry.data) {
        output += ` ${JSON.stringify(entry.data)}`;
      }

      if (entry.error) {
        output += ` Error: ${entry.error.message}`;
        if (this.config.includeStackTrace && entry.error.stack) {
          output += `\n${entry.error.stack}`;
        }
      }

      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(output);
          break;
        case LogLevel.INFO:
          console.info(output);
          break;
        case LogLevel.WARN:
          console.warn(output);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(output);
          break;
      }
    }
  }

  /**
   * Get memory usage if available
   */
  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Get all log entries
   */
  getLogs(level?: LogLevel, context?: string, since?: number): LogEntry[] {
    return this.logs.filter(entry => {
      if (level !== undefined && entry.level < level) return false;
      if (context && entry.context !== context) return false;
      if (since && entry.timestamp < since) return false;
      return true;
    });
  }

  /**
   * Clear log entries
   */
  clearLogs(): void {
    this.logs = [];
    this.info('Log entries cleared');
  }

  /**
   * Export logs as JSON
   */
  exportLogs(level?: LogLevel, since?: number): string {
    const filteredLogs = this.getLogs(level, undefined, since);
    return JSON.stringify(filteredLogs, null, 2);
  }

  /**
   * Get logger statistics
   */
  getStats(): {
    totalEntries: number;
    entriesByLevel: Record<string, number>;
    oldestEntry?: number;
    newestEntry?: number;
    contexts: string[];
  } {
    const entriesByLevel: Record<string, number> = {};
    const contexts = new Set<string>();

    for (const entry of this.logs) {
      const levelName = LogLevel[entry.level];
      entriesByLevel[levelName] = (entriesByLevel[levelName] || 0) + 1;
      if (entry.context) contexts.add(entry.context);
    }

    const timestamps = this.logs.map(entry => entry.timestamp);

    return {
      totalEntries: this.logs.length,
      entriesByLevel,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
      contexts: Array.from(contexts)
    };
  }

  /**
   * Update logger configuration
   */
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.info('Logger configuration updated', newConfig);
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}

/**
 * Request ID generator for tracing
 */
export class RequestIdGenerator {
  private static counter = 0;

  static generate(): string {
    const timestamp = Date.now().toString(36);
    const counter = (++RequestIdGenerator.counter).toString(36);
    const random = Math.random().toString(36).substring(2, 8);

    return `${timestamp}-${counter}-${random}`;
  }
}

/**
 * Performance profiler for detailed analysis
 */
export class Profiler {
  private static marks: Map<string, number> = new Map();
  private static logger = Logger.getLogger('Profiler');

  /**
   * Start profiling a section
   */
  static start(label: string): void {
    Profiler.marks.set(label, performance.now());
    if (typeof performance.mark === 'function') {
      performance.mark(`${label}_start`);
    }
  }

  /**
   * End profiling and return duration
   */
  static end(label: string): number {
    const startTime = Profiler.marks.get(label);
    if (!startTime) {
      Profiler.logger.warn(`Profiler mark not found: ${label}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    Profiler.marks.delete(label);

    if (typeof performance.mark === 'function' && typeof performance.measure === 'function') {
      performance.mark(`${label}_end`);
      performance.measure(label, `${label}_start`, `${label}_end`);
    }

    Profiler.logger.debug(`Profile: ${label}`, { duration: `${duration.toFixed(2)}ms` });

    return duration;
  }

  /**
   * Profile an async function
   */
  static async profile<T>(label: string, fn: () => Promise<T>): Promise<T> {
    Profiler.start(label);
    try {
      const result = await fn();
      Profiler.end(label);
      return result;
    } catch (error) {
      Profiler.end(label);
      throw error;
    }
  }

  /**
   * Get performance entries
   */
  static getEntries(name?: string): PerformanceEntry[] {
    if (typeof performance.getEntriesByName === 'function' && name) {
      return performance.getEntriesByName(name);
    }
    if (typeof performance.getEntries === 'function') {
      return performance.getEntries();
    }
    return [];
  }

  /**
   * Clear performance entries
   */
  static clear(): void {
    if (typeof performance.clearMarks === 'function') {
      performance.clearMarks();
    }
    if (typeof performance.clearMeasures === 'function') {
      performance.clearMeasures();
    }
    Profiler.marks.clear();
  }
}

// Global logger instances
export const apiLogger = Logger.getLogger('API');
export const cacheLogger = Logger.getLogger('Cache');
export const widgetLogger = Logger.getLogger('Widget');
export const errorLogger = Logger.getLogger('Error', { level: LogLevel.WARN });

/**
 * Decorator for automatic method logging
 */
export function Logged(context?: string, level: LogLevel = LogLevel.INFO) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const logger = Logger.getLogger(context || target.constructor.name);

    descriptor.value = async function (...args: any[]) {
      const requestId = RequestIdGenerator.generate();
      const methodName = `${target.constructor.name}.${propertyName}`;

      logger.startPerformance(methodName);
      logger.log(level, `Method started: ${methodName}`, { args }, undefined, requestId);

      try {
        const result = await method.apply(this, args);
        const duration = logger.endPerformance(methodName, `Method completed: ${methodName}`);

        logger.log(level, `Method success: ${methodName}`, {
          args,
          duration: `${duration.toFixed(2)}ms`,
          success: true
        }, undefined, requestId);

        return result;
      } catch (error) {
        const duration = logger.endPerformance(methodName, `Method failed: ${methodName}`);

        logger.error(`Method error: ${methodName}`, error as Error, {
          args,
          duration: `${duration.toFixed(2)}ms`,
          success: false
        }, requestId);

        throw error;
      }
    };

    return descriptor;
  };
}