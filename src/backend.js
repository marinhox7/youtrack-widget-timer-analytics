/**
 * Advanced Backend Handlers for YouTrack Timer Dashboard Widget
 * Provides robust API endpoints with caching, error handling, and performance optimization
 */

// In-memory cache for backend operations
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds default

// Rate limiting storage
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

/**
 * Utility functions for backend operations
 */
const utils = {
  /**
   * Check cache validity
   */
  isCacheValid(entry) {
    return entry && (Date.now() - entry.timestamp) < entry.ttl;
  },

  /**
   * Get from cache or execute function
   */
  async getOrCache(key, fn, ttl = CACHE_TTL) {
    const cached = cache.get(key);
    if (this.isCacheValid(cached)) {
      return cached.data;
    }

    const data = await fn();
    cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    return data;
  },

  /**
   * Rate limiting check
   */
  checkRateLimit(clientId) {
    const now = Date.now();
    const clientData = rateLimitMap.get(clientId) || { count: 0, windowStart: now };

    // Reset window if expired
    if (now - clientData.windowStart > RATE_LIMIT_WINDOW) {
      clientData.count = 0;
      clientData.windowStart = now;
    }

    clientData.count++;
    rateLimitMap.set(clientId, clientData);

    return clientData.count <= RATE_LIMIT_MAX_REQUESTS;
  },

  /**
   * Validate YouTrack token format
   */
  isValidToken(token) {
    if (!token || typeof token !== 'string') return false;
    // YouTrack tokens typically follow pattern: perm-base64.base64.base64
    return /^perm-[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/.test(token);
  },

  /**
   * Sanitize and validate query parameters
   */
  sanitizeQuery(query) {
    if (!query || typeof query !== 'string') return '';
    // Remove potentially dangerous characters but keep YouTrack query syntax
    return query.replace(/[<>\"'&]/g, '').substring(0, 500);
  },

  /**
   * Log with structured format
   */
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data
    };
    console.log(`[${level}] [${timestamp}] ${message}`, data);
    return logEntry;
  },

  /**
   * Error response helper
   */
  errorResponse(ctx, status, code, message, details = {}) {
    const error = {
      error: {
        code,
        message,
        timestamp: Date.now(),
        requestId: Math.random().toString(36).substring(2),
        ...details
      }
    };

    this.log('ERROR', `HTTP ${status}: ${message}`, { code, details });
    ctx.response.status(status);
    ctx.response.json(error);
  },

  /**
   * Success response helper
   */
  successResponse(ctx, data, meta = {}) {
    const response = {
      data,
      meta: {
        timestamp: Date.now(),
        cached: false,
        ...meta
      }
    };

    ctx.response.json(response);
  }
};

/**
 * Timer data processing functions
 */
const timerProcessor = {
  /**
   * Process raw timer hash data
   */
  processTimerData(issues) {
    const now = Date.now();
    const entries = [];

    issues.forEach(issue => {
      if (!issue.customFields) return;

      const timerField = issue.customFields.find(field => {
        const fieldName = field.name || field.field?.name || '';
        return fieldName === 'Timer Hash Data' ||
               fieldName.toLowerCase().includes('timer hash') ||
               fieldName.toLowerCase().includes('timer_hash');
      });

      if (!timerField || !timerField.value) return;

      let timerHashData = {};
      try {
        if (typeof timerField.value === 'string') {
          timerHashData = JSON.parse(timerField.value);
        } else if (typeof timerField.value === 'object') {
          timerHashData = timerField.value;
        }
      } catch (e) {
        utils.log('WARN', 'Failed to parse timer data', { issueId: issue.id, error: e.message });
        return;
      }

      const issueKey = `${issue.project.shortName}-${issue.numberInProject}`;

      Object.entries(timerHashData).forEach(([username, timestamp]) => {
        const startTime = parseInt(timestamp, 10);
        if (isNaN(startTime)) return;

        const elapsedMs = now - startTime;
        const hours = elapsedMs / (1000 * 60 * 60);

        let status = 'ok';
        if (hours > 8) status = 'critical';
        else if (hours > 4) status = 'long';
        else if (hours > 2) status = 'attention';

        entries.push({
          id: `${issue.id}_${username}`,
          username,
          issueId: issue.id,
          issueKey,
          issueSummary: issue.summary,
          startTime,
          elapsedMs,
          status,
          projectName: issue.project.name || issue.project.shortName,
          projectShortName: issue.project.shortName
        });
      });
    });

    // Sort by elapsed time (longest first)
    entries.sort((a, b) => b.elapsedMs - a.elapsedMs);

    return entries;
  },

  /**
   * Calculate statistics from timer entries
   */
  calculateStats(entries) {
    const uniqueUsers = new Set(entries.map(e => e.username));
    const projectBreakdown = {};
    const userBreakdown = {};

    let totalTimeMs = 0;
    let criticalTimers = 0;
    let longTimers = 0;
    let attentionTimers = 0;

    entries.forEach(entry => {
      totalTimeMs += entry.elapsedMs;

      switch (entry.status) {
        case 'critical': criticalTimers++; break;
        case 'long': longTimers++; break;
        case 'attention': attentionTimers++; break;
      }

      // Project breakdown
      if (!projectBreakdown[entry.projectShortName]) {
        projectBreakdown[entry.projectShortName] = {
          projectId: entry.projectShortName,
          projectName: entry.projectName,
          projectShortName: entry.projectShortName,
          timerCount: 0,
          totalTimeMs: 0,
          criticalCount: 0,
          users: new Set()
        };
      }
      const project = projectBreakdown[entry.projectShortName];
      project.timerCount++;
      project.totalTimeMs += entry.elapsedMs;
      if (entry.status === 'critical') project.criticalCount++;
      project.users.add(entry.username);

      // User breakdown
      if (!userBreakdown[entry.username]) {
        userBreakdown[entry.username] = {
          username: entry.username,
          timerCount: 0,
          totalTimeMs: 0,
          longestTimerMs: 0,
          criticalCount: 0,
          projects: new Set()
        };
      }
      const user = userBreakdown[entry.username];
      user.timerCount++;
      user.totalTimeMs += entry.elapsedMs;
      user.longestTimerMs = Math.max(user.longestTimerMs, entry.elapsedMs);
      if (entry.status === 'critical') user.criticalCount++;
      user.projects.add(entry.projectShortName);
    });

    // Convert sets to arrays
    Object.values(projectBreakdown).forEach(project => {
      project.users = Array.from(project.users);
      project.averageTimeMs = project.timerCount > 0 ? project.totalTimeMs / project.timerCount : 0;
    });

    Object.values(userBreakdown).forEach(user => {
      user.projects = Array.from(user.projects);
      user.averageTimeMs = user.timerCount > 0 ? user.totalTimeMs / user.timerCount : 0;
    });

    return {
      totalUsers: uniqueUsers.size,
      totalTimers: entries.length,
      criticalTimers,
      longTimers,
      attentionTimers,
      totalTimeMs,
      averageTimeMs: entries.length > 0 ? totalTimeMs / entries.length : 0,
      longestTimerMs: entries.length > 0 ? Math.max(...entries.map(e => e.elapsedMs)) : 0,
      projectBreakdown: Object.values(projectBreakdown),
      userBreakdown: Object.values(userBreakdown)
    };
  }
};

/**
 * HTTP Handler with comprehensive endpoints
 */
exports.httpHandler = {
  endpoints: [
    /**
     * Debug endpoint for testing
     */
    {
      method: 'GET',
      path: 'debug',
      handle: function(ctx) {
        const requestParam = ctx.request.getParameter('test');
        const clientId = ctx.request.getRemoteAddr() || 'unknown';

        if (!utils.checkRateLimit(clientId)) {
          return utils.errorResponse(ctx, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests');
        }

        utils.log('INFO', 'Debug endpoint called', { test: requestParam, clientId });

        utils.successResponse(ctx, {
          test: requestParam,
          timestamp: Date.now(),
          version: '2.0.0',
          features: ['caching', 'rate-limiting', 'error-handling']
        });
      }
    },

    /**
     * Get processed timer data with caching
     */
    {
      method: 'GET',
      path: 'timers',
      handle: async function(ctx) {
        const clientId = ctx.request.getRemoteAddr() || 'unknown';

        if (!utils.checkRateLimit(clientId)) {
          return utils.errorResponse(ctx, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests');
        }

        try {
          const projectId = ctx.request.getParameter('project');
          const userId = ctx.request.getParameter('user');
          const cacheKey = `timers_${projectId || 'all'}_${userId || 'all'}`;

          const result = await utils.getOrCache(cacheKey, async () => {
            // Build query
            let query = 'has: {Timer Hash Data}';
            if (projectId) {
              query += ` project: ${utils.sanitizeQuery(projectId)}`;
            }

            const fields = 'id,summary,project(shortName,name),numberInProject,customFields(name,value,field(name))';

            utils.log('INFO', 'Fetching timer data', { query, projectId, userId });

            // This would typically make the actual YouTrack API call
            // For now, return mock data structure
            const mockIssues = []; // In real implementation, this would be fetched from YouTrack

            return {
              timers: timerProcessor.processTimerData(mockIssues),
              stats: timerProcessor.calculateStats(timerProcessor.processTimerData(mockIssues))
            };
          });

          utils.successResponse(ctx, result, { cached: true, cacheKey });

        } catch (error) {
          utils.log('ERROR', 'Failed to fetch timer data', { error: error.message });
          utils.errorResponse(ctx, 500, 'TIMER_FETCH_ERROR', 'Failed to fetch timer data', {
            details: error.message
          });
        }
      }
    },

    /**
     * Get timer statistics
     */
    {
      method: 'GET',
      path: 'stats',
      handle: async function(ctx) {
        const clientId = ctx.request.getRemoteAddr() || 'unknown';

        if (!utils.checkRateLimit(clientId)) {
          return utils.errorResponse(ctx, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests');
        }

        try {
          const scope = ctx.request.getParameter('scope') || 'global';
          const cacheKey = `stats_${scope}`;

          const stats = await utils.getOrCache(cacheKey, async () => {
            // In real implementation, this would aggregate timer data
            return {
              totalUsers: 0,
              totalTimers: 0,
              criticalTimers: 0,
              averageTimeMs: 0,
              topProjects: [],
              topUsers: [],
              trends: {
                hourly: [],
                daily: [],
                weekly: []
              }
            };
          });

          utils.successResponse(ctx, stats, { scope });

        } catch (error) {
          utils.errorResponse(ctx, 500, 'STATS_ERROR', 'Failed to calculate statistics');
        }
      }
    },

    /**
     * Health check endpoint
     */
    {
      method: 'GET',
      path: 'health',
      handle: function(ctx) {
        const health = {
          status: 'healthy',
          timestamp: Date.now(),
          uptime: process.uptime ? process.uptime() : 0,
          cache: {
            entries: cache.size,
            rateLimitEntries: rateLimitMap.size
          },
          version: '2.0.0'
        };

        utils.successResponse(ctx, health);
      }
    },

    /**
     * Clear cache endpoint
     */
    {
      method: 'POST',
      path: 'cache/clear',
      handle: function(ctx) {
        const clientId = ctx.request.getRemoteAddr() || 'unknown';

        if (!utils.checkRateLimit(clientId)) {
          return utils.errorResponse(ctx, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests');
        }

        const beforeSize = cache.size;
        cache.clear();

        utils.log('INFO', 'Cache cleared', { beforeSize, clientId });

        utils.successResponse(ctx, {
          message: 'Cache cleared successfully',
          entriesCleared: beforeSize
        });
      }
    },

    /**
     * Configuration endpoint
     */
    {
      method: 'GET',
      path: 'config',
      handle: function(ctx) {
        const config = {
          cacheTtl: CACHE_TTL,
          rateLimitWindow: RATE_LIMIT_WINDOW,
          rateLimitMaxRequests: RATE_LIMIT_MAX_REQUESTS,
          supportedFeatures: [
            'timer-processing',
            'statistics',
            'caching',
            'rate-limiting',
            'error-handling'
          ]
        };

        utils.successResponse(ctx, config);
      }
    }
  ]
};
