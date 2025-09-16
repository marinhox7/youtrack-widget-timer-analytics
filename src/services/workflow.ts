/**
 * YouTrack Workflow Integration System
 * Provides advanced workflow automation, rules, and integration capabilities
 */

import { YouTrackAPI } from './api';
import { Logger } from './logger';
import { MemoryCache } from './cache';
import { TimerEntry, IssueWithTimer } from '../types';

export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  priority: number;
  triggerEvents: WorkflowTriggerEvent[];
  schedule?: WorkflowSchedule;
  metadata?: Record<string, any>;
}

export interface WorkflowCondition {
  type: 'timer_duration' | 'timer_status' | 'issue_state' | 'user_role' | 'project' | 'time_of_day' | 'custom';
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'matches_regex';
  value: any;
  field?: string;
}

export interface WorkflowAction {
  type: 'send_notification' | 'update_issue' | 'add_comment' | 'assign_user' | 'log_time' | 'run_command' | 'webhook' | 'custom';
  parameters: Record<string, any>;
  retryPolicy?: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
  };
}

export interface WorkflowTriggerEvent {
  type: 'timer_started' | 'timer_stopped' | 'timer_critical' | 'timer_long' | 'issue_updated' | 'user_action' | 'scheduled';
  filters?: Record<string, any>;
}

export interface WorkflowSchedule {
  type: 'interval' | 'cron' | 'daily' | 'weekly';
  expression: string;
  timezone?: string;
}

export interface WorkflowExecution {
  id: string;
  ruleId: string;
  triggerEvent: WorkflowTriggerEvent;
  context: Record<string, any>;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  results: Record<string, any>;
}

/**
 * Workflow Engine - Processes rules and executes actions
 */
export class WorkflowEngine {
  private static instance: WorkflowEngine;
  private rules: Map<string, WorkflowRule> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private logger = Logger.getLogger('WorkflowEngine');
  private api: YouTrackAPI;
  private cache: MemoryCache;
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    this.api = new YouTrackAPI();
    this.cache = MemoryCache.getInstance();
    this.initializeDefaultRules();
  }

  static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }

  private initializeDefaultRules() {
    // Default rule: Notify on critical timers
    const criticalTimerRule: WorkflowRule = {
      id: 'critical-timer-notification',
      name: 'Critical Timer Notification',
      description: 'Send notification when timer exceeds 8 hours',
      enabled: true,
      priority: 1,
      conditions: [
        {
          type: 'timer_duration',
          operator: 'greater_than',
          value: 8 * 60 * 60 * 1000 // 8 hours in milliseconds
        },
        {
          type: 'timer_status',
          operator: 'equals',
          value: 'critical'
        }
      ],
      actions: [
        {
          type: 'send_notification',
          parameters: {
            type: 'critical',
            title: 'Critical Timer Alert',
            message: 'Timer for ${issue.key} by ${user.name} has exceeded 8 hours',
            recipients: ['team-leads', 'project-managers']
          }
        },
        {
          type: 'add_comment',
          parameters: {
            text: 'Automated notification: Timer has been active for more than 8 hours. Please review.',
            visibility: 'team'
          }
        }
      ],
      triggerEvents: [
        {
          type: 'timer_critical',
          filters: {}
        }
      ]
    };

    // Default rule: Auto-log time for completed issues
    const autoLogTimeRule: WorkflowRule = {
      id: 'auto-log-completed-time',
      name: 'Auto Log Time for Completed Issues',
      description: 'Automatically log time when issue is marked as Done',
      enabled: true,
      priority: 2,
      conditions: [
        {
          type: 'issue_state',
          operator: 'equals',
          value: 'Done'
        }
      ],
      actions: [
        {
          type: 'log_time',
          parameters: {
            type: 'Development',
            description: 'Automatically logged from timer data'
          }
        },
        {
          type: 'send_notification',
          parameters: {
            type: 'success',
            title: 'Time Logged',
            message: 'Time automatically logged for completed issue ${issue.key}'
          }
        }
      ],
      triggerEvents: [
        {
          type: 'issue_updated',
          filters: {
            field: 'State',
            newValue: 'Done'
          }
        }
      ]
    };

    // Default rule: Daily summary report
    const dailySummaryRule: WorkflowRule = {
      id: 'daily-summary-report',
      name: 'Daily Timer Summary',
      description: 'Generate daily summary of timer activities',
      enabled: true,
      priority: 3,
      conditions: [],
      actions: [
        {
          type: 'webhook',
          parameters: {
            url: '/api/reports/daily-summary',
            method: 'POST',
            payload: {
              date: '${current.date}',
              includeCharts: true
            }
          }
        }
      ],
      triggerEvents: [
        {
          type: 'scheduled'
        }
      ],
      schedule: {
        type: 'daily',
        expression: '0 18 * * *', // 6 PM daily
        timezone: 'UTC'
      }
    };

    this.addRule(criticalTimerRule);
    this.addRule(autoLogTimeRule);
    this.addRule(dailySummaryRule);
  }

  addRule(rule: WorkflowRule): void {
    this.rules.set(rule.id, rule);
    this.scheduleRule(rule);
    this.logger.info('Workflow rule added', { ruleId: rule.id, name: rule.name });
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.unscheduleRule(ruleId);
    this.logger.info('Workflow rule removed', { ruleId });
  }

  updateRule(ruleId: string, updates: Partial<WorkflowRule>): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);
    this.scheduleRule(updatedRule);
    this.logger.info('Workflow rule updated', { ruleId, updates });
  }

  private scheduleRule(rule: WorkflowRule): void {
    if (!rule.schedule || !rule.enabled) return;

    // Clear existing schedule
    this.unscheduleRule(rule.id);

    let intervalMs: number;

    switch (rule.schedule.type) {
      case 'interval':
        intervalMs = parseInt(rule.schedule.expression);
        break;
      case 'daily':
        intervalMs = 24 * 60 * 60 * 1000; // 24 hours
        break;
      case 'weekly':
        intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        break;
      default:
        this.logger.warn('Unsupported schedule type', { type: rule.schedule.type });
        return;
    }

    const job = setInterval(async () => {
      await this.executeRule(rule, {
        type: 'scheduled'
      }, {});
    }, intervalMs);

    this.scheduledJobs.set(rule.id, job);
    this.logger.debug('Rule scheduled', { ruleId: rule.id, intervalMs });
  }

  private unscheduleRule(ruleId: string): void {
    const job = this.scheduledJobs.get(ruleId);
    if (job) {
      clearInterval(job);
      this.scheduledJobs.delete(ruleId);
      this.logger.debug('Rule unscheduled', { ruleId });
    }
  }

  async processEvent(event: WorkflowTriggerEvent, context: Record<string, any>): Promise<void> {
    const applicableRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .filter(rule => rule.triggerEvents.some(trigger => trigger.type === event.type))
      .sort((a, b) => a.priority - b.priority);

    this.logger.info('Processing workflow event', {
      eventType: event.type,
      applicableRules: applicableRules.length,
      context
    });

    for (const rule of applicableRules) {
      try {
        await this.executeRule(rule, event, context);
      } catch (error) {
        this.logger.error('Rule execution failed', error as Error, {
          ruleId: rule.id,
          eventType: event.type
        });
      }
    }
  }

  private async executeRule(rule: WorkflowRule, triggerEvent: WorkflowTriggerEvent, context: Record<string, any>): Promise<WorkflowExecution> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const execution: WorkflowExecution = {
      id: executionId,
      ruleId: rule.id,
      triggerEvent,
      context,
      startTime: Date.now(),
      status: 'running',
      results: {}
    };

    this.executions.set(executionId, execution);

    try {
      // Check conditions
      const conditionsMet = await this.evaluateConditions(rule.conditions, context);

      if (!conditionsMet) {
        execution.status = 'completed';
        execution.endTime = Date.now();
        execution.results.skipped = 'Conditions not met';
        this.logger.debug('Rule conditions not met, skipping', { ruleId: rule.id });
        return execution;
      }

      // Execute actions
      for (const action of rule.actions) {
        try {
          const result = await this.executeAction(action, context);
          execution.results[action.type] = result;
        } catch (actionError) {
          this.logger.error('Action execution failed', actionError as Error, {
            ruleId: rule.id,
            actionType: action.type
          });

          // Handle retry policy
          if (action.retryPolicy) {
            // Implement retry logic here
            this.logger.info('Retrying action', { actionType: action.type });
          }

          execution.results[action.type] = { error: (actionError as Error).message };
        }
      }

      execution.status = 'completed';
      execution.endTime = Date.now();

      this.logger.info('Rule executed successfully', {
        ruleId: rule.id,
        executionId,
        duration: execution.endTime - execution.startTime
      });

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = (error as Error).message;

      this.logger.error('Rule execution failed', error as Error, {
        ruleId: rule.id,
        executionId
      });
    }

    return execution;
  }

  private async evaluateConditions(conditions: WorkflowCondition[], context: Record<string, any>): Promise<boolean> {
    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, context);
      if (!result) {
        return false; // All conditions must be true
      }
    }
    return true;
  }

  private async evaluateCondition(condition: WorkflowCondition, context: Record<string, any>): Promise<boolean> {
    let actualValue: any;

    switch (condition.type) {
      case 'timer_duration':
        actualValue = context.timer?.elapsedMs || 0;
        break;
      case 'timer_status':
        actualValue = context.timer?.status;
        break;
      case 'issue_state':
        actualValue = context.issue?.state;
        break;
      case 'user_role':
        actualValue = context.user?.role;
        break;
      case 'project':
        actualValue = context.issue?.projectShortName;
        break;
      case 'time_of_day':
        actualValue = new Date().getHours();
        break;
      case 'custom':
        actualValue = condition.field ? context[condition.field] : null;
        break;
      default:
        this.logger.warn('Unknown condition type', { type: condition.type });
        return false;
    }

    return this.compareValues(actualValue, condition.operator, condition.value);
  }

  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'greater_than':
        return actual > expected;
      case 'less_than':
        return actual < expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'matches_regex':
        return new RegExp(expected).test(String(actual));
      default:
        return false;
    }
  }

  private async executeAction(action: WorkflowAction, context: Record<string, any>): Promise<any> {
    switch (action.type) {
      case 'send_notification':
        return this.sendNotification(action.parameters, context);
      case 'update_issue':
        return this.updateIssue(action.parameters, context);
      case 'add_comment':
        return this.addComment(action.parameters, context);
      case 'assign_user':
        return this.assignUser(action.parameters, context);
      case 'log_time':
        return this.logTime(action.parameters, context);
      case 'run_command':
        return this.runCommand(action.parameters, context);
      case 'webhook':
        return this.callWebhook(action.parameters, context);
      case 'custom':
        return this.executeCustomAction(action.parameters, context);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async sendNotification(parameters: Record<string, any>, context: Record<string, any>): Promise<any> {
    // Implement notification sending
    const message = this.interpolateTemplate(parameters.message, context);
    const title = this.interpolateTemplate(parameters.title, context);

    this.logger.info('Sending notification', { title, message, type: parameters.type });

    // In real implementation, integrate with notification system
    return { sent: true, title, message };
  }

  private async updateIssue(parameters: Record<string, any>, context: Record<string, any>): Promise<any> {
    if (!context.issue?.id) {
      throw new Error('Issue ID not found in context');
    }

    // Implement issue update via YouTrack API
    this.logger.info('Updating issue', { issueId: context.issue.id, updates: parameters });

    return { updated: true, issueId: context.issue.id };
  }

  private async addComment(parameters: Record<string, any>, context: Record<string, any>): Promise<any> {
    if (!context.issue?.id) {
      throw new Error('Issue ID not found in context');
    }

    const text = this.interpolateTemplate(parameters.text, context);

    this.logger.info('Adding comment to issue', { issueId: context.issue.id, text });

    return { commentAdded: true, issueId: context.issue.id, text };
  }

  private async assignUser(parameters: Record<string, any>, context: Record<string, any>): Promise<any> {
    if (!context.issue?.id) {
      throw new Error('Issue ID not found in context');
    }

    this.logger.info('Assigning user to issue', {
      issueId: context.issue.id,
      userId: parameters.userId
    });

    return { assigned: true, issueId: context.issue.id, userId: parameters.userId };
  }

  private async logTime(parameters: Record<string, any>, context: Record<string, any>): Promise<any> {
    if (!context.timer || !context.issue?.id) {
      throw new Error('Timer or issue data not found in context');
    }

    const duration = context.timer.elapsedMs;
    const description = this.interpolateTemplate(parameters.description, context);

    this.logger.info('Logging time to issue', {
      issueId: context.issue.id,
      duration,
      type: parameters.type
    });

    return { timeLogged: true, issueId: context.issue.id, duration, type: parameters.type };
  }

  private async runCommand(parameters: Record<string, any>, context: Record<string, any>): Promise<any> {
    const command = this.interpolateTemplate(parameters.command, context);

    this.logger.info('Running command', { command });

    // In real implementation, execute system command safely
    return { executed: true, command };
  }

  private async callWebhook(parameters: Record<string, any>, context: Record<string, any>): Promise<any> {
    const url = this.interpolateTemplate(parameters.url, context);
    const payload = this.interpolateObject(parameters.payload, context);

    this.logger.info('Calling webhook', { url, method: parameters.method });

    // In real implementation, make HTTP request
    return { called: true, url, method: parameters.method, payload };
  }

  private async executeCustomAction(parameters: Record<string, any>, context: Record<string, any>): Promise<any> {
    // Implement custom action execution
    this.logger.info('Executing custom action', { parameters, context });

    return { executed: true, custom: true };
  }

  private interpolateTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      return value !== undefined ? String(value) : match;
    });
  }

  private interpolateObject(obj: any, context: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.interpolateTemplate(obj, context);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateObject(item, context));
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateObject(value, context);
      }
      return result;
    }

    return obj;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key];
    }, obj);
  }

  // Public methods for external integration
  getRules(): WorkflowRule[] {
    return Array.from(this.rules.values());
  }

  getRule(ruleId: string): WorkflowRule | undefined {
    return this.rules.get(ruleId);
  }

  getExecutions(ruleId?: string): WorkflowExecution[] {
    const executions = Array.from(this.executions.values());
    return ruleId ? executions.filter(e => e.ruleId === ruleId) : executions;
  }

  async testRule(ruleId: string, testContext: Record<string, any>): Promise<WorkflowExecution> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    return this.executeRule(rule, { type: 'user_action' }, testContext);
  }

  enableRule(ruleId: string): void {
    this.updateRule(ruleId, { enabled: true });
  }

  disableRule(ruleId: string): void {
    this.updateRule(ruleId, { enabled: false });
  }

  cleanup(): void {
    // Clear all scheduled jobs
    this.scheduledJobs.forEach(job => clearInterval(job));
    this.scheduledJobs.clear();

    // Clear executions (keep only recent ones)
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    for (const [id, execution] of this.executions.entries()) {
      if (execution.startTime < cutoff) {
        this.executions.delete(id);
      }
    }

    this.logger.info('Workflow engine cleanup completed');
  }
}

export default {
  WorkflowEngine
};