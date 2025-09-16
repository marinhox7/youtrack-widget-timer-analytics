/**
 * Environment Configuration Validator
 * Validates and manages all environment variables required for the YouTrack Timer Dashboard Widget
 */

export interface EnvironmentConfig {
  youtrack: {
    host: string;
    token: string;
    baseUrl: string;
  };
  app: {
    nodeEnv: string;
    refreshInterval: number;
    maxTimerHours: number;
    isDevelopment: boolean;
    isProduction: boolean;
  };
  api: {
    timeout: number;
    maxRetries: number;
    retryDelay: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * ConfigValidator - Centralized environment variable validation and management
 */
export class ConfigValidator {
  private static instance: ConfigValidator;
  private config: EnvironmentConfig | null = null;
  private validationErrors: string[] = [];

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator();
    }
    return ConfigValidator.instance;
  }

  /**
   * Validates all required environment variables
   */
  public validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Required variables validation
      const youtrackHost = this.getEnvVar('YOUTRACK_HOST', true);
      const youtrackToken = this.getEnvVar('YOUTRACK_TOKEN', true);

      if (!youtrackHost) {
        errors.push('YOUTRACK_HOST is required. Set your YouTrack instance URL (e.g., mycompany.youtrack.cloud)');
      } else if (!this.isValidUrl(youtrackHost)) {
        errors.push('YOUTRACK_HOST must be a valid URL or domain (e.g., mycompany.youtrack.cloud)');
      }

      if (!youtrackToken) {
        errors.push('YOUTRACK_TOKEN is required. Generate a token at YouTrack → Profile → Account Security');
      } else if (youtrackToken.length < 20) {
        errors.push('YOUTRACK_TOKEN appears invalid (too short). Please generate a new token from YouTrack');
      }

      // Optional variables with defaults
      const nodeEnv = this.getEnvVar('NODE_ENV', false) || 'development';
      const refreshInterval = parseInt(this.getEnvVar('REFRESH_INTERVAL', false) || '30000', 10);
      const maxTimerHours = parseInt(this.getEnvVar('MAX_TIMER_HOURS', false) || '8', 10);

      // Validation for numeric values
      if (refreshInterval < 5000) {
        warnings.push('REFRESH_INTERVAL is less than 5 seconds, this may cause performance issues');
      }

      if (maxTimerHours < 1 || maxTimerHours > 24) {
        warnings.push('MAX_TIMER_HOURS should be between 1 and 24 hours');
      }

      // Build configuration if validation passes
      if (errors.length === 0) {
        this.config = this.buildConfig(youtrackHost!, youtrackToken!, nodeEnv, refreshInterval, maxTimerHours);
      }

      this.validationErrors = errors;

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      errors.push(`Configuration validation failed: ${errorMessage}`);

      return {
        isValid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Get validated configuration
   * Throws error if configuration is not valid
   */
  public getConfig(): EnvironmentConfig {
    if (!this.config) {
      const validation = this.validate();
      if (!validation.isValid) {
        throw new Error(`Configuration is invalid:\n${validation.errors.join('\n')}`);
      }
    }

    return this.config!;
  }

  /**
   * Get configuration safely with fallback for development
   */
  public getConfigSafe(): EnvironmentConfig {
    try {
      return this.getConfig();
    } catch (error) {
      const isDev = this.getEnvVar('NODE_ENV', false) === 'development' ||
                   (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV);


      if (isDev) {
        console.warn('⚠️ Using fallback configuration for development:', error);
    return this.getFallbackConfig();
  }

  throw error;
}
  }

  /**
   * Check if configuration has been validated successfully
   */
  public isValid(): boolean {
    return this.config !== null && this.validationErrors.length === 0;
  }

  /**
   * Get current validation errors
   */
  public getErrors(): string[] {
    return [...this.validationErrors];
  }

  /**
   * Reset validation state
   */
  public reset(): void {
    this.config = null;
    this.validationErrors = [];
  }

  /**
   * Private helper to get environment variable from multiple sources
   */
  private getEnvVar(name: string, required: boolean): string | null {
    let value: string | undefined;

    // Check Node.js environment
    if (typeof process !== 'undefined' && process.env) {
      value = process.env[name];
    }

    // Check Vite environment (browser build)
    if (!value && typeof import.meta !== 'undefined' && (import.meta as any).env) {
      value = (import.meta as any).env[`VITE_${name}`] || (import.meta as any).env[name];
    }

    if (!value && required) {
      return null;
    }

    return value || null;
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      // Allow both full URLs and domain-only formats
      const testUrl = url.startsWith('http') ? url : `https://${url}`;
      const urlObj = new URL(testUrl);
      return urlObj.hostname.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Build validated configuration object
   */
  private buildConfig(
    youtrackHost: string,
    youtrackToken: string,
    nodeEnv: string,
    refreshInterval: number,
    maxTimerHours: number
  ): EnvironmentConfig {
    const cleanHost = youtrackHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const baseUrl = `https://${cleanHost}`;
    const isDevelopment = nodeEnv === 'development';

    return {
      youtrack: {
        host: cleanHost,
        token: youtrackToken,
        baseUrl
      },
      app: {
        nodeEnv,
        refreshInterval,
        maxTimerHours,
        isDevelopment,
        isProduction: nodeEnv === 'production'
      },
      api: {
        timeout: 10000, // 10 seconds
        maxRetries: 3,
        retryDelay: 1000 // 1 second base delay
      }
    };
  }

  /**
   * Fallback configuration for development
   */
  private getFallbackConfig(): EnvironmentConfig {
    return {
      youtrack: {
        host: 'dev.youtrack.cloud',
        token: 'dev-token-placeholder',
        baseUrl: 'https://dev.youtrack.cloud'
      },
      app: {
        nodeEnv: 'development',
        refreshInterval: 30000,
        maxTimerHours: 8,
        isDevelopment: true,
        isProduction: false
      },
      api: {
        timeout: 10000,
        maxRetries: 3,
        retryDelay: 1000
      }
    };
  }
}

/**
 * Convenience function to get validated configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return ConfigValidator.getInstance().getConfig();
}

/**
 * Convenience function to get configuration safely with development fallback
 */
export function getEnvironmentConfigSafe(): EnvironmentConfig {
  return ConfigValidator.getInstance().getConfigSafe();
}

/**
 * Initialize and validate environment configuration
 * Should be called at application startup
 */
export function initializeEnvironment(): ValidationResult {
  const validator = ConfigValidator.getInstance();
  const result = validator.validate();

  if (!result.isValid) {
    console.error('❌ Environment Configuration Errors:');
    result.errors.forEach(error => console.error(`  • ${error}`));
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️ Environment Configuration Warnings:');
    result.warnings.forEach(warning => console.warn(`  • ${warning}`));
  }

  if (result.isValid) {
    console.log('✅ Environment configuration validated successfully');
  }

  return result;
}

export default ConfigValidator;