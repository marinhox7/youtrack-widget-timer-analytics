// API types and utilities for YouTrack Timer Dashboard

export interface TimerHashData {
  [username: string]: string; // timestamp
}

export interface IssueWithTimer {
  id: string;
  summary: string;
  project: {
    shortName: string;
  };
  numberInProject: number;
  timerHashData: TimerHashData;
}

export interface TimerEntry {
  username: string;
  issueId: string;
  issueKey: string;
  issueSummary: string;
  startTime: number;
  elapsedMs: number;
  status: 'ok' | 'attention' | 'long' | 'critical';
  issueUrl: string;
}

export interface TimerStats {
  totalUsers: number;
  criticalTimers: number;
  totalTimeMs: number;
}

export class YouTrackAPI {
  private host: any = null;

  constructor(host?: any) {
    this.host = host;
  }

  async fetchIssuesWithTimers(): Promise<IssueWithTimer[]> {
    try {
      const query = 'has: {Timer Hash Data}';
      const fields = 'id,summary,project(shortName),numberInProject,customFields(name,value,field(name))';

      console.log('[YouTrack API] Fetching issues with timers...', { query, fields });

      // Use proper YouTrack widget API method
      if (!this.host || !this.host.fetchYouTrack) {
        throw new Error('YouTrack host context not available. Widget must be running within YouTrack.');
      }

      const url = `issues?query=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;
      console.log('[YouTrack API] Using host.fetchYouTrack for:', url);

      const data = await this.host.fetchYouTrack(url);

      if (!data) {
        throw new Error('No data received from YouTrack API');
      }
      console.log('[YouTrack API] Raw response:', data);

      if (!Array.isArray(data)) {
        throw new Error('Invalid API response format - expected array');
      }

      const issues: IssueWithTimer[] = data
        .map((issue: any): IssueWithTimer | null => {
          // Look for Timer Hash Data field with multiple approaches
          const timerField = issue.customFields?.find((field: any) => {
            const fieldName = field.name || field.field?.name || '';
            return fieldName === 'Timer Hash Data' ||
                   fieldName.toLowerCase().includes('timer hash') ||
                   fieldName.toLowerCase().includes('timer_hash');
          });

          if (!timerField || !timerField.value) {
            return null;
          }

          let timerHashData: TimerHashData = {};

          try {
            // Handle different value formats
            if (typeof timerField.value === 'string') {
              timerHashData = JSON.parse(timerField.value);
            } else if (typeof timerField.value === 'object') {
              timerHashData = timerField.value;
            } else {
              console.warn('[YouTrack API] Unexpected value format:', typeof timerField.value);
              return null;
            }
          } catch (e) {
            console.warn('[YouTrack API] Failed to parse timer data for issue:', issue.id, timerField.value);
            return null;
          }

          return {
            id: issue.id,
            summary: issue.summary,
            project: issue.project,
            numberInProject: issue.numberInProject,
            timerHashData
          };
        })
        .filter((issue): issue is IssueWithTimer => issue !== null);

      console.log('[YouTrack API] Processed issues with timers:', issues.length);

      if (issues.length === 0) {
        throw new Error('No issues found with Timer Hash Data field or active timers');
      }

      return issues;

    } catch (error) {
      console.error('[YouTrack API] Error fetching issues:', error);
      throw error;
    }
  }
}

export function processTimerData(issues: IssueWithTimer[]): TimerEntry[] {
  const now = Date.now();
  const entries: TimerEntry[] = [];

  issues.forEach(issue => {
    const issueKey = `${issue.project.shortName}-${issue.numberInProject}`;
    const issueUrl = `/issue/${issueKey}`; // Use relative URL for YouTrack widgets

    Object.entries(issue.timerHashData).forEach(([username, timestamp]) => {
      const startTime = parseInt(timestamp, 10);
      const elapsedMs = now - startTime;

      // Determine status based on elapsed time
      let status: TimerEntry['status'] = 'ok';
      const hours = elapsedMs / (1000 * 60 * 60);

      if (hours > 8) {
        status = 'critical';
      } else if (hours > 4) {
        status = 'long';
      } else if (hours > 2) {
        status = 'attention';
      }

      entries.push({
        username,
        issueId: issue.id,
        issueKey,
        issueSummary: issue.summary,
        startTime,
        elapsedMs,
        status,
        issueUrl
      });
    });
  });

  // Sort by elapsed time (longest first)
  entries.sort((a, b) => b.elapsedMs - a.elapsedMs);

  console.log('[Timer Processing] Processed timer entries:', entries.length);
  return entries;
}

export function calculateStats(entries: TimerEntry[]): TimerStats {
  const uniqueUsers = new Set(entries.map(e => e.username));
  const criticalTimers = entries.filter(e => e.status === 'critical').length;
  const totalTimeMs = entries.reduce((sum, e) => sum + e.elapsedMs, 0);

  return {
    totalUsers: uniqueUsers.size,
    criticalTimers,
    totalTimeMs
  };
}

export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes}min`;
  }

  return `${hours}h ${minutes}min`;
}

