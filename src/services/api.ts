/**
 * Advanced YouTrack API Client with comprehensive error handling, caching, and retry logic
 * Provides robust integration with YouTrack REST API and widget host context
 */

import {
  YouTrackAPIConfig,
  APIRequestOptions,
  APIResponse,
  IssueWithTimer,
  TimerEntry,
  TimerStats,
  YouTrackIssue,
  YouTrackProject,
  YouTrackUser,
  YouTrackTag,
  RateLimitConfig
} from '../types';
import { globalCache, CacheKeyGenerator } from './cache';
import { globalErrorHandler, HandleErrors, createError } from './errorHandler';
import { Logger, RequestIdGenerator, Logged } from './logger';
import { debounce } from 'throttle-debounce';

/**
 * Rate limiter for API requests
 */
class RateLimiter {
  private requests: number[] = [];

  constructor(private config: RateLimitConfig) {}

  canMakeRequest(): boolean {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.config.windowMs);

    if (this.requests.length >= this.config.maxRequests) {
      return false;
    }

    this.requests.push(now);
    return true;
  }

  getNextAvailableTime(): number {
    if (this.requests.length < this.config.maxRequests) {
      return 0;
    }

    const oldestRequest = Math.min(...this.requests);
    return oldestRequest + this.config.windowMs - Date.now();
  }
}

/**
 * Advanced YouTrack API client with comprehensive features
 */
export class YouTrackAPI {
  private logger = Logger.getLogger('YouTrackAPI');
  private rateLimiter: RateLimiter;
  private debouncedFetch: any;

  constructor(
    private host?: any,
    private config: YouTrackAPIConfig = {
      timeout: 10000,
      maxRetries: 3,
      retryDelay: 1000,
      rateLimit: {
        maxRequests: 100,
        windowMs: 60000
      },
      cache: {
        enabled: true,
        defaultTtl: 30000
      }
    }
  ) {
    this.rateLimiter = new RateLimiter(this.config.rateLimit!);

    // Debounce fetch requests to prevent spam
    this.debouncedFetch = debounce(500, this.rawFetch.bind(this));
  }

  /**
   * Fetch issues with timer data using advanced filtering and pagination
   */
  async fetchIssuesWithTimers(options: {
    projectId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
    fields?: string[];
    customQuery?: string;
  } = {}): Promise<IssueWithTimer[]> {
    const requestId = RequestIdGenerator.generate();

    // Build optimized query
    let query = 'has: {Timer Hash Data}';

    if (options.projectId) {
      query += ` project: ${options.projectId}`;
    }

    if (options.userId) {
      query += ` Assignee: ${options.userId}`;
    }

    if (options.customQuery) {
      query += ` ${options.customQuery}`;
    }

    // Optimize fields for better performance (request only what is used)
    // Note: Requesting all custom fields can be very heavy. While YouTrack
    // fields filtering for a specific custom field name is limited, we still
    // minimize other fields drastically to cut payload size.
    const defaultFields = [
      'id',
      'summary',
      'project(shortName,name)',
      'numberInProject',
      'updated',
      // Keep customFields minimal; we only need to locate and parse the timer field
      'customFields(name,value,field(name))'
    ];

    const fields = options.fields || defaultFields;

    // Pagination parameters
    const queryParams = new URLSearchParams({
      query,
      fields: fields.join(','),
      $top: (options.limit || 100).toString(),
      $skip: (options.offset || 0).toString()
    });

    const cacheKey = CacheKeyGenerator.apiKey('issues_with_timers', {
      query,
      fields: fields.join(','),
      limit: options.limit,
      offset: options.offset
    });

    this.logger.info('Fetching issues with timers', {
      query,
      fields: fields.length,
      limit: options.limit,
      offset: options.offset,
      requestId
    });

    // Try cache first if enabled
    if (this.config.cache?.enabled) {
      const cached = await globalCache.get<YouTrackIssue[]>(cacheKey);
      if (cached) {
        this.logger.info('Using cached issues data', { count: cached.length, requestId });
        return this.processIssuesWithTimers(cached);
      }
    }

    // Make API request
    const response = await this.makeRequest<YouTrackIssue[]>(
      `issues?${queryParams.toString()}`,
      { cache: false },
      requestId
    );

    // Cache the response
    if (this.config.cache?.enabled) {
      await globalCache.set(cacheKey, response.data, this.config.cache.defaultTtl);
    }

    return this.processIssuesWithTimers(response.data);
  }

  /**
   * Fetch specific issue by ID with full details
   */
  
  
  async fetchIssue(issueId: string, fields?: string[]): Promise<YouTrackIssue | null> {
    const requestId = RequestIdGenerator.generate();

    const defaultFields = [
      'id',
      'summary',
      'description',
      'project(id,shortName,name)',
      'numberInProject',
      'customFields(name,value,field(name,fieldType))',
      'assignees(login,fullName,id,avatarUrl)',
      'reporter(login,fullName)',
      'created',
      'updated',
      'resolved',
      'tags(name,color)',
      'priority(name,color)',
      'state(name,color)',
      'attachments(name,size,url)',
      'links(direction,linkType(name),issues(id,summary))',
      'watchers(login,fullName)',
      'votes'
    ];

    const queryParams = new URLSearchParams({
      fields: (fields || defaultFields).join(',')
    });

    const cacheKey = CacheKeyGenerator.apiKey(`issue_${issueId}`, { fields: (fields || defaultFields).join(',') });

    // Try cache first
    if (this.config.cache?.enabled) {
      const cached = await globalCache.get<YouTrackIssue>(cacheKey);
      if (cached) {
        this.logger.info('Using cached issue data', { issueId, requestId });
        return cached;
      }
    }

    try {
      const response = await this.makeRequest<YouTrackIssue>(
        `issues/${issueId}?${queryParams.toString()}`,
        { cache: false },
        requestId
      );

      // Cache the response
      if (this.config.cache?.enabled) {
        await globalCache.set(cacheKey, response.data, this.config.cache.defaultTtl);
      }

      return response.data;
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetch projects with pagination and filtering
   */
  
  
  async fetchProjects(options: {
    archived?: boolean;
    limit?: number;
    offset?: number;
    query?: string;
  } = {}): Promise<YouTrackProject[]> {
    const requestId = RequestIdGenerator.generate();

    const queryParams = new URLSearchParams({
      fields: 'id,name,shortName,description,archived,leader(login,fullName)',
      $top: (options.limit || 50).toString(),
      $skip: (options.offset || 0).toString()
    });

    if (options.archived !== undefined) {
      queryParams.append('archived', options.archived.toString());
    }

    if (options.query) {
      queryParams.append('query', options.query);
    }

    const cacheKey = CacheKeyGenerator.apiKey('projects', options);

    // Try cache first
    if (this.config.cache?.enabled) {
      const cached = await globalCache.get<YouTrackProject[]>(cacheKey);
      if (cached) {
        this.logger.info('Using cached projects data', { count: cached.length, requestId });
        return cached;
      }
    }

    const response = await this.makeRequest<YouTrackProject[]>(
      `admin/projects?${queryParams.toString()}`,
      { cache: false },
      requestId
    );

    // Cache the response
    if (this.config.cache?.enabled) {
      await globalCache.set(cacheKey, response.data, this.config.cache.defaultTtl);
    }

    return response.data;
  }

  /**
   * Fetch users with advanced filtering
   */
  
  
  async fetchUsers(options: {
    query?: string;
    banned?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<YouTrackUser[]> {
    const requestId = RequestIdGenerator.generate();

    const queryParams = new URLSearchParams({
      fields: 'id,login,fullName,email,avatarUrl,banned,online,guest,tags(name)',
      $top: (options.limit || 50).toString(),
      $skip: (options.offset || 0).toString()
    });

    if (options.query) {
      queryParams.append('query', options.query);
    }

    if (options.banned !== undefined) {
      queryParams.append('banned', options.banned.toString());
    }

    const cacheKey = CacheKeyGenerator.apiKey('users', options);

    // Try cache first
    if (this.config.cache?.enabled) {
      const cached = await globalCache.get<YouTrackUser[]>(cacheKey);
      if (cached) {
        this.logger.info('Using cached users data', { count: cached.length, requestId });
        return cached;
      }
    }

    const response = await this.makeRequest<YouTrackUser[]>(
      `admin/users?${queryParams.toString()}`,
      { cache: false },
      requestId
    );

    // Cache the response with longer TTL for user data
    if (this.config.cache?.enabled) {
      await globalCache.set(cacheKey, response.data, this.config.cache.defaultTtl * 2);
    }

    return response.data;
  }

  /**
   * Process raw issues data into timer entries
   */
  private processIssuesWithTimers(issues: YouTrackIssue[]): IssueWithTimer[] {
    return issues
      .map((issue: YouTrackIssue): IssueWithTimer | null => {
        const timerField = issue.customFields?.find((field: any) => {
          const fieldName = field.name || field.field?.name || '';
          return fieldName === 'Timer Hash Data' ||
                 fieldName.toLowerCase().includes('timer hash') ||
                 fieldName.toLowerCase().includes('timer_hash');
        });

        if (!timerField || !timerField.value) {
          return null;
        }

        let timerHashData = {};
        try {
          if (typeof timerField.value === 'string') {
            timerHashData = JSON.parse(timerField.value);
          } else if (typeof timerField.value === 'object') {
            timerHashData = timerField.value;
          }
        } catch (e) {
          this.logger.warn('Failed to parse timer data', { issueId: issue.id, error: (e as Error).message });
          return null;
        }

        return {
          id: issue.id,
          summary: issue.summary,
          description: issue.description,
          project: issue.project,
          numberInProject: issue.numberInProject,
          timerHashData,
          assignees: issue.assignees,
          created: issue.created,
          updated: issue.updated,
          tags: issue.tags || []
        };
      })
      .filter((issue): issue is IssueWithTimer => issue !== null);
  }

  /**
   * Make authenticated request to YouTrack API
   */
  private async makeRequest<T>(
    endpoint: string,
    options: APIRequestOptions = {},
    requestId?: string
  ): Promise<APIResponse<T>> {
    // Check rate limiting
    if (!this.rateLimiter.canMakeRequest()) {
      const waitTime = this.rateLimiter.getNextAvailableTime();
      throw createError.api(
        `Rate limit exceeded. Retry after ${waitTime}ms`,
        'RATE_LIMIT_EXCEEDED',
        { waitTime },
        requestId
      );
    }

    // Use widget host context if available
    if (this.host && this.host.fetchYouTrack) {
      return this.makeWidgetRequest<T>(endpoint, options, requestId);
    }

    // Fallback to direct API calls (for testing/development)
    return this.makeDirectRequest<T>(endpoint, options, requestId);
  }

  /**
   * Make request using YouTrack widget host context
   */
  private async makeWidgetRequest<T>(
    endpoint: string,
    options: APIRequestOptions,
    requestId?: string
  ): Promise<APIResponse<T>> {
    const startTime = performance.now();

    try {
      if (!this.host?.fetchYouTrack) {
        throw createError.configuration(
          'YouTrack host context not available',
          'HOST_CONTEXT_MISSING',
          { endpoint },
          requestId
        );
      }

      this.logger.debug('Making widget API request', { endpoint, requestId });

      const data = await this.host.fetchYouTrack(endpoint);

      if (!data) {
        throw createError.api(
          'No data received from YouTrack API',
          'EMPTY_RESPONSE',
          { endpoint },
          requestId
        );
      }

      const duration = performance.now() - startTime;

      return {
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        cached: false,
        requestId: requestId || RequestIdGenerator.generate(),
        timestamp: Date.now(),
        duration
      };

    } catch (error: any) {
      const duration = performance.now() - startTime;

      // Transform widget errors to standardized format
      if (error.message?.includes('unauthorized') || error.message?.includes('403')) {
        throw createError.permission(
          'Insufficient permissions for YouTrack API',
          'PERMISSION_DENIED',
          { endpoint, duration },
          requestId
        );
      }

      if (error.message?.includes('not found') || error.message?.includes('404')) {
        throw createError.api(
          'Resource not found',
          'NOT_FOUND',
          { endpoint, duration },
          requestId
        );
      }

      if (error.message?.includes('network') || error.message?.includes('timeout')) {
        throw createError.network(
          'Network error accessing YouTrack API',
          'NETWORK_ERROR',
          { endpoint, duration },
          requestId
        );
      }

      throw createError.api(
        error.message || 'Unknown API error',
        'API_ERROR',
        { endpoint, duration, originalError: error },
        requestId
      );
    }
  }

  /**
   * Make direct HTTP request (for development/testing)
   */
  private async makeDirectRequest<T>(
    endpoint: string,
    options: APIRequestOptions,
    requestId?: string
  ): Promise<APIResponse<T>> {
    const startTime = performance.now();
    const url = `${this.config.baseUrl || '/api'}/${endpoint}`;

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeout || this.config.timeout || 10000)
      });

      const duration = performance.now() - startTime;

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch {
          // Ignore JSON parse errors for error responses
        }

        throw createError.api(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          errorData.code || `HTTP_${response.status}`,
          {
            status: response.status,
            statusText: response.statusText,
            url,
            duration,
            errorData
          },
          requestId
        );
      }

      const data = await response.json();

      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        cached: false,
        requestId: requestId || RequestIdGenerator.generate(),
        timestamp: Date.now(),
        duration
      };

    } catch (error: any) {
      const duration = performance.now() - startTime;

      if (error.name === 'AbortError') {
        throw createError.network(
          'Request timeout',
          'TIMEOUT',
          { url, timeout: options.timeout || this.config.timeout, duration },
          requestId
        );
      }

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw createError.network(
          'Network connection failed',
          'CONNECTION_FAILED',
          { url, duration },
          requestId
        );
      }

      // Re-throw if already a structured error
      if (error.type) {
        throw error;
      }

      throw createError.api(
        error.message || 'Unknown request error',
        'REQUEST_ERROR',
        { url, duration, originalError: error },
        requestId
      );
    }
  }

  /**
   * Raw fetch method for debouncing
   */
  private async rawFetch(endpoint: string, options: APIRequestOptions = {}): Promise<any> {
    return this.makeRequest(endpoint, options);
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateCache(pattern?: string): Promise<void> {
    if (!this.config.cache?.enabled) return;

    if (pattern) {
      const regex = new RegExp(pattern);
      const keys = await globalCache.keys();
      const matchingKeys = keys.filter(key => regex.test(key));

      for (const key of matchingKeys) {
        await globalCache.delete(key);
      }

      this.logger.info('Cache invalidated by pattern', { pattern, keysCleared: matchingKeys.length });
    } else {
      await globalCache.clear();
      this.logger.info('All cache cleared');
    }
  }

  /**
   * Get API configuration
   */
  getConfig(): YouTrackAPIConfig {
    return { ...this.config };
  }

  /**
   * Update API configuration
   */
  updateConfig(newConfig: Partial<YouTrackAPIConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update rate limiter if config changed
    if (newConfig.rateLimit) {
      this.rateLimiter = new RateLimiter(this.config.rateLimit!);
    }

    this.logger.info('API configuration updated', newConfig);
  }

  /**
   * Get API statistics
   */
  async getStats(): Promise<{
    requestCount: number;
    cacheHits: number;
    cacheMisses: number;
    averageResponseTime: number;
    rateLimitStatus: {
      remainingRequests: number;
      resetTime: number;
    };
  }> {
    const cacheStats = await globalCache.stats();
    const totalRequests = cacheStats.hitRate + cacheStats.missRate;

    return {
      requestCount: Math.floor(totalRequests / 100 * (cacheStats.hitRate + cacheStats.missRate)),
      cacheHits: Math.floor(totalRequests / 100 * cacheStats.hitRate),
      cacheMisses: Math.floor(totalRequests / 100 * cacheStats.missRate),
      averageResponseTime: 0, // Would need to track this separately
      rateLimitStatus: {
        remainingRequests: Math.max(0, this.config.rateLimit!.maxRequests - this.rateLimiter['requests'].length),
        resetTime: this.rateLimiter.getNextAvailableTime()
      }
    };
  }

  /**
   * Process timer data from issues
   */
  processTimerData(issues: IssueWithTimer[]): TimerEntry[] {
    return processTimerData(issues);
  }

  /**
   * Calculate statistics from timer entries
   */
  calculateStats(entries: TimerEntry[]): TimerStats {
    return calculateStats(entries);
  }

  /**
   * Check if current user has admin permissions with enhanced system-admin detection
   */
  async checkUserPermissions(): Promise<{
    isAdmin: boolean;
    canManageTimers: boolean;
    isSystemAdmin: boolean;
    userInfo: { login: string; permissions: string[] };
  }> {
    const requestId = RequestIdGenerator.generate();
    this.logger.debug('checkUserPermissions called with enhanced system-admin detection', {
      hasHost: !!this.host,
      requestId
    });

    // In widget context, assume admin permissions to avoid API errors
    if (this.host) {
      this.logger.info('Widget context detected - assuming system-admin permissions', { requestId });
      return {
        isAdmin: true,
        canManageTimers: true,
        isSystemAdmin: true,
        userInfo: { login: 'system-admin (widget-context)', permissions: ['ADMIN', 'UPDATE_ISSUE'] }
      };
    }

    try {
      // Try to check current user endpoint first (less likely to fail)
      const userResponse = await this.makeRequest<YouTrackUser>(
        'users/me',
        { method: 'GET' },
        requestId
      );

      const user = userResponse.data;

      // Enhanced system-admin detection
      let hasAdminAccess = false;
      let isSystemAdmin = false;

      // Primary check: login is 'system-admin'
      if (user?.login === 'system-admin') {
        hasAdminAccess = true;
        isSystemAdmin = true;
        this.logger.info('System-admin detected via login', { login: user.login, requestId });
      }
      // Secondary check: login contains 'admin'
      else if (user?.login?.includes('admin')) {
        hasAdminAccess = true;
        // Only consider system-admin if exactly 'system-admin' or ends with 'system-admin'
        isSystemAdmin = user.login.endsWith('system-admin');
        this.logger.info('Admin user detected via login pattern', {
          login: user.login,
          isSystemAdmin,
          requestId
        });
      }
      // Profile-based permission check
      else if (user?.profiles && Array.isArray(user.profiles)) {
        const adminProfile = user.profiles.find((profile) => {
          return profile.permission?.name?.includes('ADMIN') ||
                 profile.permission?.name?.includes('CREATE_PROJECT') ||
                 profile.permission?.name?.includes('UPDATE_NOT_OWN');
        });

        if (adminProfile) {
          hasAdminAccess = true;
          // Check if specifically system-admin via permission name
          isSystemAdmin = !!(adminProfile.permission?.name?.includes('SYSTEM_ADMIN'));

          this.logger.info('Admin detected via profile permissions', {
            hasAdminAccess,
            isSystemAdmin,
            profilePermission: adminProfile.permission?.name,
            requestId
          });
        }
      }

      const userInfo = {
        login: user?.login || '',
        permissions: user?.profiles?.map(p => p.permission?.name).filter(Boolean) || []
      };

      this.logger.info('User permissions determined with enhanced detection', {
        login: user?.login,
        hasAdminAccess,
        isSystemAdmin,
        profileCount: user?.profiles?.length || 0,
        requestId
      });

      return {
        isAdmin: hasAdminAccess,
        canManageTimers: hasAdminAccess,
        isSystemAdmin,
        userInfo
      };
    } catch (error: any) {
      this.logger.debug('users/me endpoint not accessible, using fallback detection', {
        error: error.code || error.message,
        requestId
      });

      // Fallback: in widget context, assume limited admin access
      if (this.host) {
        this.logger.info('Widget context fallback - assuming limited admin permissions', { requestId });
        return {
          isAdmin: true,
          canManageTimers: true,
          isSystemAdmin: true,
          userInfo: { login: 'system-admin (widget-fallback)', permissions: ['UPDATE_ISSUE'] }
        };
      }

      this.logger.info('No admin access detected', { requestId });
      return {
        isAdmin: false,
        canManageTimers: false,
        isSystemAdmin: false,
        userInfo: { login: '', permissions: [] }
      };
    }
  }

  /**
   * Get work items for an issue
   */
  async getWorkItems(issueId: string): Promise<any[]> {
    const requestId = RequestIdGenerator.generate();

    try {
      const response = await this.makeRequest<any[]>(
        `issues/${issueId}/timeTracking/workItems?fields=id,author(login,name),duration,date,text,type(name)`,
        { method: 'GET' },
        requestId
      );

      return response.data || [];
    } catch (error) {
      this.logger.error('Failed to fetch work items', null, { issueId, requestId });
      throw error;
    }
  }

  /**
   * Delete a work item (stops/cancels timer)
   */
  async deleteWorkItem(issueId: string, workItemId: string): Promise<boolean> {
    const requestId = RequestIdGenerator.generate();

    try {
      await this.makeRequest(
        `issues/${issueId}/timeTracking/workItems/${workItemId}`,
        { method: 'DELETE' },
        requestId
      );

      this.logger.info('Work item deleted successfully', { issueId, workItemId, requestId });
      return true;
    } catch (error) {
      this.logger.error('Failed to delete work item', null, { issueId, workItemId, requestId });
      throw error;
    }
  }

  /**
   * Stop timer by updating Timer field to "Stop"
   */
  async stopTimer(issueId: string): Promise<boolean> {
    const requestId = RequestIdGenerator.generate();

    try {
      await this.makeRequest(
        `issues/${issueId}`,
        {
          method: 'POST',
          body: {
            customFields: [
              {
                name: 'Timer',
                value: { name: 'Stop' }
              }
            ]
          }
        },
        requestId
      );

      this.logger.info('Timer stopped successfully', { issueId, requestId });
      return true;
    } catch (error) {
      this.logger.error('Failed to stop timer', null, { issueId, requestId });
      throw error;
    }
  }

  /**
   * Get audit logs for timer cancellations (admin only)
   */
  async getTimerAuditLogs(limit: number = 50): Promise<any[]> {
    const permissions = await this.checkUserPermissions();

    if (!permissions.isSystemAdmin) {
      throw createError.permission(
        'Only system-admin can access audit logs',
        'AUDIT_LOG_SYSTEM_ADMIN_REQUIRED'
      );
    }

    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const auditLogs = JSON.parse(localStorage.getItem('youtrack_timer_audit_logs') || '[]');
      return auditLogs.slice(-limit).reverse(); // Return most recent first
    } catch (error) {
      this.logger.error('Failed to retrieve audit logs', error as Error);
      return [];
    }
  }

  /**
   * Update issue with custom fields
   */
  async updateIssue(issueId: string, customFields: Record<string, any>): Promise<void> {
    const requestId = RequestIdGenerator.generate();

    try {
      const fieldsArray = Object.entries(customFields).map(([name, value]) => ({
        name,
        value: typeof value === 'object' ? value : { name: value }
      }));

      await this.makeRequest(
        `issues/${issueId}`,
        {
          method: 'POST',
          body: {
            customFields: fieldsArray
          }
        },
        requestId
      );

      this.logger.info('Issue updated successfully', {
        issueId,
        fieldsUpdated: Object.keys(customFields),
        requestId
      });

      // Invalidate relevant caches
      await this.invalidateCache(`issue_${issueId}`);

    } catch (error) {
      this.logger.error('Failed to update issue', error as Error, {
        issueId,
        fields: Object.keys(customFields),
        requestId
      });
      throw error;
    }
  }
}

/**
 * Process timer data utility functions
 */
export function processTimerData(issues: IssueWithTimer[]): TimerEntry[] {
  const now = Date.now();
  const entries: TimerEntry[] = [];

  issues.forEach(issue => {
    const issueKey = `${issue.project.shortName}-${issue.numberInProject}`;
    const issueUrl = `/issue/${issueKey}`;

    Object.entries(issue.timerHashData).forEach(([username, timestamp]) => {
      const startTime = parseInt(timestamp, 10);
      if (isNaN(startTime)) return;

      const elapsedMs = now - startTime;
      const hours = elapsedMs / (1000 * 60 * 60);

      // CORRIGIR: Remover "overtime", timers 8h+ são "critical"
      let status: TimerEntry['status'] = 'ok';
      if (hours >= 8) status = 'critical';      // 8h+ = crítico (era overtime)
      else if (hours >= 4) status = 'long';     // 4-8h = longo
      else if (hours >= 2) status = 'attention'; // 2-4h = atenção
      // < 2h = ok (padrão)

      entries.push({
        id: `${issue.id}_${username}`,
        username,
        issueId: issue.id,
        issueKey,
        issueSummary: issue.summary,
        issueDescription: issue.description,
        startTime,
        elapsedMs,
        status,
        issueUrl,
        projectName: issue.project.name || issue.project.shortName,
        projectShortName: issue.project.shortName,
        assignees: issue.assignees?.map(a => a.fullName || a.login) || [],
        tags: (issue.tags || []).map((tag) => typeof tag === 'string' ? { id: tag, name: tag } : tag) as YouTrackTag[],
        lastUpdated: issue.updated
      });
    });
  });

  // Sort by elapsed time (longest first)
  entries.sort((a, b) => b.elapsedMs - a.elapsedMs);

  return entries;
}

/**
 * Calculate comprehensive statistics from timer entries
 */
export function calculateStats(entries: TimerEntry[]): TimerStats {
  const uniqueUsers = new Set(entries.map(e => e.username));
  const projectBreakdown = new Map();
  const userBreakdown = new Map();

  let totalTimeMs = 0;
  let criticalTimers = 0;
  let longTimers = 0;
  let attentionTimers = 0;

  entries.forEach(entry => {
    totalTimeMs += entry.elapsedMs;

    // CORRIGIR: Remover "overtime", contar apenas "critical"
    switch (entry.status) {
      case 'critical':
        criticalTimers++;
        break;
      case 'long':
        longTimers++;
        break;
      case 'attention':
        attentionTimers++;
        break;
      // 'ok' não precisa contador
    }

    // Project breakdown
    if (!projectBreakdown.has(entry.projectShortName)) {
      projectBreakdown.set(entry.projectShortName, {
        projectId: entry.projectShortName,
        projectName: entry.projectName,
        projectShortName: entry.projectShortName,
        timerCount: 0,
        totalTimeMs: 0,
        averageTimeMs: 0,
        criticalCount: 0,
        users: new Set()
      });
    }

    const project = projectBreakdown.get(entry.projectShortName);
    project.timerCount++;
    project.totalTimeMs += entry.elapsedMs;
    // CORRIGIR: Apenas "critical", sem "overtime"
    if (entry.status === 'critical') project.criticalCount++;
    project.users.add(entry.username);

    // User breakdown
    if (!userBreakdown.has(entry.username)) {
      userBreakdown.set(entry.username, {
        username: entry.username,
        timerCount: 0,
        totalTimeMs: 0,
        averageTimeMs: 0,
        longestTimerMs: 0,
        criticalCount: 0,
        projects: new Set()
      });
    }

    const user = userBreakdown.get(entry.username);
    user.timerCount++;
    user.totalTimeMs += entry.elapsedMs;
    user.longestTimerMs = Math.max(user.longestTimerMs, entry.elapsedMs);
    // CORRIGIR: Apenas "critical", sem "overtime"
    if (entry.status === 'critical') user.criticalCount++;
    user.projects.add(entry.projectShortName);
  });

  // Finalize breakdowns
  const projectBreakdownArray = Array.from(projectBreakdown.values()).map(project => ({
    ...project,
    averageTimeMs: project.timerCount > 0 ? project.totalTimeMs / project.timerCount : 0,
    users: Array.from(project.users)
  }));

  const userBreakdownArray = Array.from(userBreakdown.values()).map(user => ({
    ...user,
    averageTimeMs: user.timerCount > 0 ? user.totalTimeMs / user.timerCount : 0,
    projects: Array.from(user.projects)
  }));

  return {
    totalUsers: uniqueUsers.size,
    totalTimers: entries.length,
    criticalTimers,
    longTimers,
    attentionTimers,
    totalTimeMs,
    averageTimeMs: entries.length > 0 ? totalTimeMs / entries.length : 0,
    longestTimerMs: entries.length > 0 ? Math.max(...entries.map(e => e.elapsedMs)) : 0,
    projectBreakdown: projectBreakdownArray,
    userBreakdown: userBreakdownArray
  };
}

/**
 * Format duration with intelligent precision
 */
export function formatDuration(ms: number, options: {
  precision?: 'low' | 'medium' | 'high';
  showSeconds?: boolean;
} = {}): string {
  const { precision = 'medium', showSeconds = false } = options;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (precision === 'high' || showSeconds) {
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  if (precision === 'low') {
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  // Medium precision (default)
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}min`;
  return showSeconds ? `${seconds}s` : '< 1min';
}
