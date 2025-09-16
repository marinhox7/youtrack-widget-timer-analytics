/**
 * Advanced Error Handling System for YouTrack Timer Dashboard
 * Provides comprehensive error management with retry logic, fallbacks, and user-friendly messaging
 */

import { AppError, AppErrorType, ErrorHandlerConfig } from '../types';
import { Logger, RequestIdGenerator } from './logger';

/**
 * Custom error classes for different error types
 */
export class ApiError extends Error implements AppError {
  public readonly type: AppErrorType = 'API_ERROR';
  public readonly timestamp: number;
  public readonly retryable: boolean;

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any,
    public readonly requestId?: string,
    public readonly userMessage?: string,
    public readonly techMessage?: string,
    retryable: boolean = true
  ) {
    super(message);
    this.name = 'ApiError';
    this.timestamp = Date.now();
    this.retryable = retryable;
  }
}

export class NetworkError extends Error implements AppError {
  public readonly type: AppErrorType = 'NETWORK_ERROR';
  public readonly timestamp: number;
  public readonly retryable: boolean = true;

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any,
    public readonly requestId?: string,
    public readonly userMessage?: string,
    public readonly techMessage?: string
  ) {
    super(message);
    this.name = 'NetworkError';
    this.timestamp = Date.now();
  }
}

export class ValidationError extends Error implements AppError {
  public readonly type: AppErrorType = 'VALIDATION_ERROR';
  public readonly timestamp: number;
  public readonly retryable: boolean = false;

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any,
    public readonly requestId?: string,
    public readonly userMessage?: string,
    public readonly techMessage?: string
  ) {
    super(message);
    this.name = 'ValidationError';
    this.timestamp = Date.now();
  }
}

export class PermissionError extends Error implements AppError {
  public readonly type: AppErrorType = 'PERMISSION_ERROR';
  public readonly timestamp: number;
  public readonly retryable: boolean = false;

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any,
    public readonly requestId?: string,
    public readonly userMessage?: string,
    public readonly techMessage?: string
  ) {
    super(message);
    this.name = 'PermissionError';
    this.timestamp = Date.now();
  }
}

export class CacheError extends Error implements AppError {
  public readonly type: AppErrorType = 'CACHE_ERROR';
  public readonly timestamp: number;
  public readonly retryable: boolean = true;

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any,
    public readonly requestId?: string,
    public readonly userMessage?: string,
    public readonly techMessage?: string
  ) {
    super(message);
    this.name = 'CacheError';
    this.timestamp = Date.now();
  }
}

export class ConfigurationError extends Error implements AppError {
  public readonly type: AppErrorType = 'CONFIGURATION_ERROR';
  public readonly timestamp: number;
  public readonly retryable: boolean = false;

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any,
    public readonly requestId?: string,
    public readonly userMessage?: string,
    public readonly techMessage?: string
  ) {
    super(message);
    this.name = 'ConfigurationError';
    this.timestamp = Date.now();
  }
}

/**
 * Retry configuration for automatic retry logic
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors: AppErrorType[];
}

/**
 * Fallback data provider interface
 */
export interface FallbackProvider<T = any> {
  getFallbackData(error: AppError, context?: any): Promise<T> | T;
  canProvideFallback(error: AppError): boolean;
}

/**
 * Error notification handler interface
 */
export interface ErrorNotificationHandler {
  notifyUser(error: AppError, userMessage: string): void;
  notifyDeveloper(error: AppError): void;
  shouldNotifyUser(error: AppError): boolean;
}

/**
 * Comprehensive error handler with retry logic and fallbacks
 */
export class ErrorHandler {
  private logger = Logger.getLogger('ErrorHandler');
  private errorHistory: AppError[] = [];
  private fallbackProviders = new Map<string, FallbackProvider>();
  private notificationHandlers: ErrorNotificationHandler[] = [];

  constructor(
    private config: ErrorHandlerConfig = {
      logErrors: true,
      showUserMessages: true,
      reportToService: false,
      retryFailedRequests: true,
      maxRetries: 3,
      fallbackData: null
    }
  ) {}

  /**
   * Handle error with comprehensive processing
   */
  async handleError<T = any>(
    error: Error | AppError,
    context?: any,
    fallbackKey?: string
  ): Promise<T | null> {
    const appError = this.normalizeError(error, context);

    // Log the error
    if (this.config.logErrors) {
      this.logError(appError, context);
    }

    // Add to error history
    this.addToHistory(appError);

    // Notify handlers
    this.notifyHandlers(appError);

    // Try to provide fallback data
    if (fallbackKey && this.fallbackProviders.has(fallbackKey)) {
      try {
        const fallbackProvider = this.fallbackProviders.get(fallbackKey)!;
        if (fallbackProvider.canProvideFallback(appError)) {
          const fallbackData = await fallbackProvider.getFallbackData(appError, context);
          this.logger.info('Fallback data provided', { fallbackKey, error: appError.code });
          return fallbackData;
        }
      } catch (fallbackError) {
        this.logger.error('Fallback provider failed', fallbackError as Error, { fallbackKey });
      }
    }

    // Use configured fallback data
    if (this.config.fallbackData !== null && this.config.fallbackData !== undefined) {
      return this.config.fallbackData;
    }

    // Re-throw if no fallback available
    throw appError;
  }

  /**
   * Execute function with automatic retry logic
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>,
    context?: any
  ): Promise<T> {
    const config: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: ['API_ERROR', 'NETWORK_ERROR', 'CACHE_ERROR'],
      ...retryConfig
    };

    let lastError: AppError | null = null;
    let attempt = 0;

    while (attempt < config.maxAttempts) {
      try {
        attempt++;

        if (attempt > 1) {
          this.logger.info(`Retry attempt ${attempt}/${config.maxAttempts}`, { context, lastError: lastError?.code });
        }

        const result = await fn();

        if (attempt > 1) {
          this.logger.info(`Retry successful on attempt ${attempt}`, { context });
        }

        return result;
      } catch (error) {
        const appError = this.normalizeError(error as Error, context);
        lastError = appError;

        // Check if error is retryable
        if (!config.retryableErrors.includes(appError.type) || !appError.retryable) {
          this.logger.warn('Error is not retryable', { error: appError.code, type: appError.type });
          throw appError;
        }

        // If this was the last attempt, throw the error
        if (attempt >= config.maxAttempts) {
          this.logger.error(`All retry attempts exhausted (${config.maxAttempts})`, appError, { context });
          throw appError;
        }

        // Calculate delay for next attempt
        const delay = this.calculateRetryDelay(attempt, config);
        this.logger.debug(`Retrying in ${delay}ms`, { attempt, maxAttempts: config.maxAttempts, error: appError.code });

        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError!;
  }

  /**
   * Wrap async function with error handling
   */
  wrap<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    fallbackKey?: string,
    retryConfig?: Partial<RetryConfig>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        if (this.config.retryFailedRequests && retryConfig !== false) {
          return await this.withRetry(() => fn(...args), retryConfig);
        } else {
          return await fn(...args);
        }
      } catch (error) {
        const result = await this.handleError<R>(error as Error, { args }, fallbackKey);
        if (result !== null && result !== undefined) {
          return result;
        }
        throw error;
      }
    };
  }

  /**
   * Register fallback provider
   */
  registerFallbackProvider(key: string, provider: FallbackProvider): void {
    this.fallbackProviders.set(key, provider);
    this.logger.info('Fallback provider registered', { key });
  }

  /**
   * Register notification handler
   */
  registerNotificationHandler(handler: ErrorNotificationHandler): void {
    this.notificationHandlers.push(handler);
    this.logger.info('Notification handler registered');
  }

  /**
   * Get error statistics
   */
  getErrorStats(timeRange?: number): {
    totalErrors: number;
    errorsByType: Record<AppErrorType, number>;
    errorsByCode: Record<string, number>;
    recentErrors: AppError[];
    errorRate: number; // errors per minute
  } {
    const cutoff = timeRange ? Date.now() - timeRange : 0;
    const relevantErrors = this.errorHistory.filter(error => error.timestamp >= cutoff);

    const errorsByType = {} as Record<AppErrorType, number>;
    const errorsByCode = {} as Record<string, number>;

    for (const error of relevantErrors) {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
      errorsByCode[error.code] = (errorsByCode[error.code] || 0) + 1;
    }

    const timeRangeMinutes = timeRange ? timeRange / 60000 : (Date.now() - (relevantErrors[0]?.timestamp || Date.now())) / 60000;
    const errorRate = timeRangeMinutes > 0 ? relevantErrors.length / timeRangeMinutes : 0;

    return {
      totalErrors: relevantErrors.length,
      errorsByType,
      errorsByCode,
      recentErrors: relevantErrors.slice(-10), // Last 10 errors
      errorRate
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
    this.logger.info('Error history cleared');
  }

  /**
   * Normalize any error to AppError format
   */
  private normalizeError(error: Error | AppError, context?: any): AppError {
    if (this.isAppError(error)) {
      return error;
    }

    // Try to determine error type based on error properties
    let type: AppErrorType = 'UNKNOWN_ERROR';
    let code = error.name || 'UNKNOWN';
    let userMessage = 'Ocorreu um erro inesperado. Tente novamente.';
    let retryable = true;

    // Network errors
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout')) {
      type = 'NETWORK_ERROR';
      code = 'NETWORK_FAILURE';
      userMessage = 'Problema de conexão. Verifique sua internet e tente novamente.';
    }
    // Permission errors
    else if (error.message.includes('unauthorized') || error.message.includes('forbidden') || error.message.includes('permission')) {
      type = 'PERMISSION_ERROR';
      code = 'ACCESS_DENIED';
      userMessage = 'Você não tem permissão para executar esta ação.';
      retryable = false;
    }
    // Validation errors
    else if (error.message.includes('validation') || error.message.includes('invalid')) {
      type = 'VALIDATION_ERROR';
      code = 'INVALID_INPUT';
      userMessage = 'Dados inválidos. Verifique as informações e tente novamente.';
      retryable = false;
    }

    return new class extends Error implements AppError {
      public readonly type = type;
      public readonly timestamp = Date.now();
      public readonly retryable = retryable;
      public readonly requestId = context?.requestId || RequestIdGenerator.generate();
      public readonly userMessage = userMessage;
      public readonly techMessage = error.message;

      constructor(
        message: string,
        public readonly code: string,
        public readonly details: any = context
      ) {
        super(message);
        this.name = error.name;
      }
    }(error.message, code, context);
  }

  /**
   * Check if error is an AppError
   */
  private isAppError(error: any): error is AppError {
    return error && typeof error.type === 'string' && typeof error.timestamp === 'number';
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: AppError, context?: any): void {
    const logData = {
      type: error.type,
      code: error.code,
      message: error.message,
      details: error.details,
      requestId: error.requestId,
      retryable: error.retryable,
      context
    };

    switch (error.type) {
      case 'FATAL':
        this.logger.fatal('Fatal error occurred', error, logData, error.requestId);
        break;
      case 'PERMISSION_ERROR':
      case 'CONFIGURATION_ERROR':
        this.logger.error('Critical error occurred', error, logData, error.requestId);
        break;
      case 'API_ERROR':
      case 'NETWORK_ERROR':
        this.logger.warn('Service error occurred', logData, error.requestId);
        break;
      default:
        this.logger.info('Error handled', logData, error.requestId);
    }
  }

  /**
   * Add error to history with size limit
   */
  private addToHistory(error: AppError): void {
    this.errorHistory.push(error);

    // Maintain history size limit
    const maxHistorySize = 100;
    if (this.errorHistory.length > maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-maxHistorySize);
    }
  }

  /**
   * Notify all registered handlers
   */
  private notifyHandlers(error: AppError): void {
    for (const handler of this.notificationHandlers) {
      try {
        if (handler.shouldNotifyUser(error) && this.config.showUserMessages && error.userMessage) {
          handler.notifyUser(error, error.userMessage);
        }

        if (this.config.reportToService) {
          handler.notifyDeveloper(error);
        }
      } catch (notificationError) {
        this.logger.error('Notification handler failed', notificationError as Error, {
          originalError: error.code
        });
      }
    }
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);

    // Apply max delay limit
    delay = Math.min(delay, config.maxDelay);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Error handler configuration updated', newConfig);
  }

  /**
   * Get current configuration
   */
  getConfig(): ErrorHandlerConfig {
    return { ...this.config };
  }
}

/**
 * Default error notification handler for browser environments
 */
export class BrowserNotificationHandler implements ErrorNotificationHandler {
  private logger = Logger.getLogger('BrowserNotificationHandler');

  notifyUser(error: AppError, userMessage: string): void {
    // Show user-friendly notification (could be replaced with toast library)
    console.warn(`[User Notification] ${userMessage}`);

    // Could integrate with notification libraries like react-hot-toast, etc.
    if (typeof window !== 'undefined' && window.alert) {
      // Only use alert for critical errors to avoid spam
      if (error.type === 'PERMISSION_ERROR' || error.type === 'CONFIGURATION_ERROR') {
        window.alert(userMessage);
      }
    }
  }

  notifyDeveloper(error: AppError): void {
    this.logger.error('Developer notification', error, {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof location !== 'undefined' ? location.href : 'unknown',
      timestamp: new Date(error.timestamp).toISOString()
    });
  }

  shouldNotifyUser(error: AppError): boolean {
    // Don't notify users about cache errors or minor API errors
    return !['CACHE_ERROR'].includes(error.type);
  }
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler();

// Register default notification handler
globalErrorHandler.registerNotificationHandler(new BrowserNotificationHandler());

/**
 * Decorator for automatic error handling
 */
export function HandleErrors(fallbackKey?: string, retryConfig?: Partial<RetryConfig>) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = globalErrorHandler.wrap(method, fallbackKey, retryConfig);

    return descriptor;
  };
}

/**
 * Utility function to create specific error types
 */
export const createError = {
  api: (message: string, code: string, details?: any, requestId?: string) =>
    new ApiError(message, code, details, requestId),

  network: (message: string, code: string, details?: any, requestId?: string) =>
    new NetworkError(message, code, details, requestId),

  validation: (message: string, code: string, details?: any, requestId?: string) =>
    new ValidationError(message, code, details, requestId),

  permission: (message: string, code: string, details?: any, requestId?: string) =>
    new PermissionError(message, code, details, requestId),

  cache: (message: string, code: string, details?: any, requestId?: string) =>
    new CacheError(message, code, details, requestId),

  configuration: (message: string, code: string, details?: any, requestId?: string) =>
    new ConfigurationError(message, code, details, requestId)
};