/**
 * Comprehensive TypeScript type definitions for YouTrack Timer Dashboard Widget
 * Provides complete type safety for YouTrack API integration and internal data structures
 */

// =================== YOUTRACK API TYPES ===================

/**
 * YouTrack Issue entity with complete field definitions
 */
export interface YouTrackIssue {
  id: string;
  idReadable: string;
  summary: string;
  description?: string;
  created: number;
  updated: number;
  resolved?: number;
  numberInProject: number;
  project: YouTrackProject;
  reporter?: YouTrackUser;
  assignees?: YouTrackUser[];
  customFields: YouTrackCustomField[];
  attachments?: YouTrackAttachment[];
  links?: YouTrackIssueLink[];
  tags?: YouTrackTag[];
  votes: number;
  comments?: YouTrackComment[];
  watchers?: YouTrackUser[];
  visibility?: YouTrackVisibility;
}

/**
 * YouTrack Project entity
 */
export interface YouTrackProject {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  archived: boolean;
  fromEmail?: string;
  replyEmail?: string;
  leader?: YouTrackUser;
  createdBy?: YouTrackUser;
  issues?: YouTrackIssue[];
  customFields?: YouTrackProjectCustomField[];
}

/**
 * YouTrack User entity
 */
export interface YouTrackUser {
  id: string;
  login: string;
  fullName: string;
  email?: string;
  jabberAccountName?: string;
  ringId?: string;
  guest: boolean;
  online: boolean;
  banned: boolean;
  tags?: YouTrackTag[];
  avatarUrl?: string;
  profiles?: YouTrackUserProfile[];
}

/**
 * YouTrack Custom Field with polymorphic value types
 */
export interface YouTrackCustomField {
  id: string;
  name: string;
  value: any; // Polymorphic based on field type
  field: YouTrackCustomFieldDeclaration;
  projectCustomField?: YouTrackProjectCustomField;
}

/**
 * YouTrack Custom Field Declaration
 */
export interface YouTrackCustomFieldDeclaration {
  id: string;
  name: string;
  fieldType: YouTrackFieldType;
  isPublic: boolean;
  ordinal: number;
  aliases?: string[];
  fieldDefaults?: YouTrackFieldDefaults;
  instances?: YouTrackProjectCustomField[];
}

/**
 * YouTrack Field Types enum
 */
export interface YouTrackFieldType {
  id: string;
  presentation: string;
  valueType: string;
}

/**
 * Project-specific custom field configuration
 */
export interface YouTrackProjectCustomField {
  id: string;
  field: YouTrackCustomFieldDeclaration;
  project: YouTrackProject;
  canBeEmpty: boolean;
  isPublic: boolean;
  ordinal: number;
  bundle?: YouTrackFieldBundle;
  defaultValues?: any[];
}

// =================== TIMER-SPECIFIC TYPES ===================

/**
 * Timer Hash Data structure - maps usernames to timestamps
 */
export interface TimerHashData {
  [username: string]: string; // ISO timestamp or Unix timestamp as string
}

/**
 * Issue with timer data extracted from custom fields
 */
export interface IssueWithTimer {
  id: string;
  summary: string;
  description?: string;
  project: YouTrackProject;
  numberInProject: number;
  timerHashData: TimerHashData;
  assignees?: YouTrackUser[];
  created: number;
  updated: number;
  priority?: string;
  state?: string;
  tags?: YouTrackTag[];
}

/**
 * Processed timer entry for dashboard display
 */
export interface TimerEntry {
  id: string; // Unique identifier for this timer entry
  username: string;
  userId?: string;
  issueId: string;
  issueKey: string;
  issueSummary: string;
  issueDescription?: string;
  startTime: number; // Unix timestamp
  elapsedMs: number;
  status: TimerStatus;
  issueUrl: string;
  projectName: string;
  projectShortName: string;
  priority?: string;
  state?: string;
  assignees?: string[];
  tags?: YouTrackTag[];
  lastUpdated: number;
}

/**
 * Timer status enumeration based on elapsed time
 */
// CORRIGIR: Remover "overtime" do tipo de status
export type TimerStatus = 'ok' | 'attention' | 'long' | 'critical';

/**
 * Timer statistics for dashboard summary
 */
export interface TimerStats {
  totalUsers: number;
  totalTimers: number;
  criticalTimers: number;
  longTimers: number;
  attentionTimers: number;
  totalTimeMs: number;
  averageTimeMs: number;
  longestTimerMs: number;
  projectBreakdown: ProjectTimerStats[];
  userBreakdown: UserTimerStats[];
}

/**
 * Timer statistics per project
 */
export interface ProjectTimerStats {
  projectId: string;
  projectName: string;
  projectShortName: string;
  timerCount: number;
  totalTimeMs: number;
  averageTimeMs: number;
  criticalCount: number;
  users: string[];
}

/**
 * Timer statistics per user
 */
export interface UserTimerStats {
  username: string;
  userId?: string;
  timerCount: number;
  totalTimeMs: number;
  averageTimeMs: number;
  longestTimerMs: number;
  criticalCount: number;
  projects: string[];
}

// =================== CACHE SYSTEM TYPES ===================

/**
 * Cache entry with TTL support
 */
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  key: string;
  version?: string;
}

/**
 * Cache manager interface
 */
export interface CacheManager {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, data: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  stats(): Promise<CacheStats>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  totalSize: number; // Approximate size in bytes
  hitRate: number; // Percentage
  missRate: number; // Percentage
  oldestEntry?: number; // Timestamp
  newestEntry?: number; // Timestamp
}

// =================== API CLIENT TYPES ===================

/**
 * YouTrack API client configuration
 */
export interface YouTrackAPIConfig {
  host?: any; // YouTrack widget host context
  baseUrl?: string;
  token?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  enabled: boolean;
  defaultTtl: number; // Default TTL in milliseconds
  maxEntries?: number;
  strategy?: 'lru' | 'fifo' | 'ttl';
}

/**
 * API Request options
 */
export interface APIRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  cache?: boolean;
  cacheTtl?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * API Response wrapper
 */
export interface APIResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cached: boolean;
  requestId: string;
  timestamp: number;
  duration: number; // Request duration in milliseconds
}

// =================== WIDGET CONFIGURATION TYPES ===================

/**
 * Widget configuration for different extension points
 */
export interface WidgetConfig {
  key: string;
  name: string;
  description: string;
  extensionPoint: WidgetExtensionPoint;
  indexPath: string;
  permissions: YouTrackPermission[];
  dimensions?: WidgetDimensions;
  settings?: WidgetSettings;
}

/**
 * Widget extension points
 */
export type WidgetExtensionPoint =
  | 'DASHBOARD_WIDGET'
  | 'PROJECT_SETTINGS'
  | 'ISSUE_VIEW'
  | 'PROJECT_VIEW'
  | 'AGILE_BOARD';

/**
 * Widget dimensions configuration
 */
export interface WidgetDimensions {
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  minHeight?: string | number;
  maxWidth?: string | number;
  maxHeight?: string | number;
  resizable?: boolean;
}

/**
 * Widget-specific settings
 */
export interface WidgetSettings {
  refreshInterval?: number;
  autoRefresh?: boolean;
  showStats?: boolean;
  showProjectBreakdown?: boolean;
  showUserBreakdown?: boolean;
  alertConfig?: AlertConfig;
  displayConfig?: DisplayConfig;
  filterConfig?: FilterConfig;
}

/**
 * Alert configuration for notifications
 */
export interface AlertConfig {
  enabled: boolean;
  criticalThreshold: number; // Hours
  longThreshold: number; // Hours
  attentionThreshold: number; // Hours
  soundEnabled: boolean;
  browserNotifications: boolean;
  emailNotifications?: boolean;
  customThresholds?: Record<string, number>; // Per-user custom thresholds
}

/**
 * Display configuration
 */
export interface DisplayConfig {
  groupBy: 'user' | 'project' | 'status' | 'none';
  sortBy: 'time' | 'user' | 'project' | 'issue';
  sortOrder: 'asc' | 'desc';
  showEmptyStates: boolean;
  showDurations: boolean;
  showProjectNames: boolean;
  showUserAvatars: boolean;
  compactMode: boolean;
  maxItemsPerPage?: number;
}

/**
 * Filter configuration
 */
export interface FilterConfig {
  projects?: string[]; // Project IDs to include
  users?: string[]; // User IDs to include
  statuses?: TimerStatus[]; // Timer statuses to include
  timeRange?: TimeRangeFilter;
  customQuery?: string;
  hideCompleted?: boolean;
  hideAssigned?: boolean;
}

/**
 * Time range filter
 */
export interface TimeRangeFilter {
  type: 'last_hours' | 'last_days' | 'custom';
  value?: number; // For last_hours/last_days
  start?: number; // Unix timestamp for custom range
  end?: number; // Unix timestamp for custom range
}

// =================== ERROR HANDLING TYPES ===================

/**
 * Application error types
 */
export type AppErrorType =
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'PERMISSION_ERROR'
  | 'CACHE_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Structured application error
 */
export interface AppError extends Error {
  type: AppErrorType;
  code: string;
  details?: any;
  timestamp: number;
  requestId?: string;
  retryable: boolean;
  userMessage?: string;
  techMessage?: string;
}

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  logErrors: boolean;
  showUserMessages: boolean;
  reportToService?: boolean;
  retryFailedRequests: boolean;
  maxRetries: number;
  fallbackData?: any;
}

// =================== ADDITIONAL YOUTRACK TYPES ===================

export interface YouTrackTag {
  id: string;
  name: string;
  color?: YouTrackColor;
  untagOnResolve?: boolean;
  visibleFor?: YouTrackVisibility;
  updateableBy?: YouTrackVisibility;
  issues?: YouTrackIssue[];
}

export interface YouTrackColor {
  id: string;
  background: string;
  foreground: string;
}

export interface YouTrackVisibility {
  $type: string;
  permittedGroups?: YouTrackUserGroup[];
  permittedUsers?: YouTrackUser[];
}

export interface YouTrackUserGroup {
  id: string;
  name: string;
  description?: string;
  ringId?: string;
  usersCount?: number;
  icon?: string;
}

export interface YouTrackComment {
  id: string;
  text: string;
  created: number;
  updated?: number;
  author: YouTrackUser;
  issue?: YouTrackIssue;
  visibility?: YouTrackVisibility;
  attachments?: YouTrackAttachment[];
}

export interface YouTrackAttachment {
  id: string;
  name: string;
  author: YouTrackUser;
  created: number;
  updated?: number;
  size?: number;
  extension?: string;
  charset?: string;
  mimeType?: string;
  metaData?: string;
  url?: string;
  visibility?: YouTrackVisibility;
  issue?: YouTrackIssue;
  comment?: YouTrackComment;
}

export interface YouTrackIssueLink {
  id: string;
  direction: 'OUTWARD' | 'INWARD' | 'BOTH';
  linkType: YouTrackIssueLinkType;
  issues: YouTrackIssue[];
  trimmedIssues?: YouTrackIssue[];
}

export interface YouTrackIssueLinkType {
  id: string;
  name: string;
  localizedName?: string;
  sourceToTarget: string;
  localizedSourceToTarget?: string;
  targetToSource: string;
  localizedTargetToSource?: string;
  directed: boolean;
  aggregation: boolean;
  readOnly: boolean;
}

export interface YouTrackUserProfile {
  appearance?: YouTrackAppearanceProfile;
  timetracking?: YouTrackTimeTrackingProfile;
  notifications?: YouTrackNotificationProfile;
  permission?: YouTrackUserPermission;
}

export interface YouTrackUserPermission {
  name: string;
  type?: string;
}

export interface YouTrackAppearanceProfile {
  naturalCommentsOrder: boolean;
  showSimilarityFor?: YouTrackSimilarityWeights;
  timezone?: YouTrackTimeZone;
  locale?: YouTrackLocale;
  dateFieldFormat?: YouTrackDateFieldFormat;
}

export interface YouTrackTimeTrackingProfile {
  workDays?: YouTrackDayOfWeek[];
  workTimeSettings?: YouTrackWorkTimeSettings;
}

export interface YouTrackNotificationProfile {
  jabberNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  mentionNotificationsEnabled: boolean;
  duplicateClusterNotificationsEnabled: boolean;
  mailboxIntegrationNotificationsEnabled: boolean;
  usePlainTextEmails: boolean;
}

export interface YouTrackFieldDefaults {
  defaultValues?: any[];
  canBeEmpty: boolean;
  isPublic: boolean;
}

export interface YouTrackFieldBundle {
  id: string;
  isUpdateable: boolean;
}

export interface YouTrackSimilarityWeights {
  created: number;
  updated: number;
  summary: number;
  description: number;
}

export interface YouTrackTimeZone {
  id: string;
  presentation: string;
  offset: number;
}

export interface YouTrackLocale {
  id: string;
  language: string;
  country?: string;
  locale: string;
}

export interface YouTrackDateFieldFormat {
  datePattern: string;
  pattern: string;
}

export interface YouTrackDayOfWeek {
  id: string;
  presentation: string;
}

export interface YouTrackWorkTimeSettings {
  daysAWeek: number;
  hoursADay: number;
  workDays: YouTrackDayOfWeek[];
}

export type YouTrackPermission =
  | 'READ_ISSUE'
  | 'READ_PROJECT'
  | 'PRIVATE_READ_ISSUE'
  | 'CREATE_ISSUE'
  | 'UPDATE_ISSUE'
  | 'DELETE_ISSUE'
  | 'LINK_ISSUE'
  | 'APPLY_COMMAND'
  | 'UPDATE_NOT_OWN_ISSUE'
  | 'READ_ISSUE_WATCHERS'
  | 'UPDATE_WATCH'
  | 'CREATE_COMMENT'
  | 'READ_COMMENT'
  | 'UPDATE_COMMENT'
  | 'UPDATE_NOT_OWN_COMMENT'
  | 'DELETE_COMMENT'
  | 'DELETE_NOT_OWN_COMMENT'
  | 'CREATE_ATTACHMENT'
  | 'READ_ATTACHMENT'
  | 'UPDATE_ATTACHMENT'
  | 'DELETE_ATTACHMENT'
  | 'DELETE_NOT_OWN_ATTACHMENT';

// =================== UTILITY TYPES ===================

/**
 * Deep partial type for optional configuration objects
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract keys of a type that match a specific value type
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Make specific keys optional in a type
 */
export type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific keys required in a type
 */
export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Recursive readonly type
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};