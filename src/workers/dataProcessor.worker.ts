// Web Worker para processamento de dados em background
// Elimina travamento da UI durante filtragem e cálculos pesados

interface FilterRequest {
  type: 'FILTER_DATA';
  data: any[];
  filter: any;
  chunkSize: number;
}

interface SortRequest {
  type: 'SORT_DATA';
  data: any[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface StatsRequest {
  type: 'CALCULATE_STATS';
  data: any[];
  groupBy: string;
}

// Main message handler
self.onmessage = async function(e: MessageEvent) {
  const { type, data, filter, chunkSize, sortBy, sortOrder, groupBy } = e.data;

  try {
    switch (type) {
      case 'FILTER_DATA':
        await processFilterRequest({ type, data, filter, chunkSize });
        break;
      case 'SORT_DATA':
        await processSortRequest({ type, data, sortBy, sortOrder });
        break;
      case 'CALCULATE_STATS':
        await processStatsRequest({ type, data, groupBy });
        break;
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Optimized filter processing with chunking
async function processFilterRequest({ data, filter, chunkSize }: FilterRequest) {
  const results: any[] = [];
  const PROCESS_CHUNK_SIZE = 200; // Process 200 items at a time

  for (let i = 0; i < data.length; i += PROCESS_CHUNK_SIZE) {
    // Yield control to prevent worker blocking
    if (i > 0 && i % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    const chunk = data.slice(i, i + PROCESS_CHUNK_SIZE);
    const filtered = chunk.filter(item => applyFilter(item, filter));
    results.push(...filtered);

    // Send progress updates every 500 items
    if (i % 500 === 0 || i + PROCESS_CHUNK_SIZE >= data.length) {
      self.postMessage({
        type: 'PROGRESS',
        progress: Math.min(((i + PROCESS_CHUNK_SIZE) / data.length) * 100, 100),
        currentResults: results.length,
        processedItems: i + PROCESS_CHUNK_SIZE
      });
    }
  }

  self.postMessage({
    type: 'FILTER_COMPLETE',
    data: results,
    totalProcessed: data.length,
    totalFiltered: results.length
  });
}

// High-performance filter logic
function applyFilter(item: any, filter: any): boolean {
  if (!filter) return true;

  // Time range filter (optimized for performance)
  if (filter.timeRange && filter.timeRange !== 'day') {
    const duration = item.elapsedMs || 0;
    const hours = duration / (60 * 60 * 1000);

    switch (filter.timeRange) {
      case 'short':
        if (hours >= 2) return false;
        break;
      case 'medium':
        if (hours < 2 || hours >= 8) return false;
        break;
      case 'long':
        if (hours < 8) return false;
        break;
    }
  }

  // Project filter
  if (filter.project && filter.project !== 'all' && item.projectShortName !== filter.project) {
    return false;
  }

  // Status filter
  if (filter.status && filter.status !== 'all' && item.status !== filter.status) {
    return false;
  }

  // User filter
  if (filter.user && filter.user !== 'all' && item.username !== filter.user) {
    return false;
  }

  // Metric-based filtering
  if (filter.metric) {
    const duration = item.elapsedMs || 0;
    switch (filter.metric) {
      case 'critical':
        if (item.status !== 'critical') return false;
        break;
      case 'long_running':
        if (duration < 4 * 60 * 60 * 1000) return false; // < 4 hours
        break;
    }
  }

  return true;
}

// Optimized sorting
async function processSortRequest({ data, sortBy, sortOrder }: SortRequest) {
  const sorted = [...data].sort((a, b) => {
    let aVal, bVal;

    switch (sortBy) {
      case 'duration':
        aVal = a.elapsedMs || 0;
        bVal = b.elapsedMs || 0;
        break;
      case 'user':
        aVal = a.username || '';
        bVal = b.username || '';
        break;
      case 'project':
        aVal = a.projectShortName || '';
        bVal = b.projectShortName || '';
        break;
      case 'status':
        // Custom status priority order
        const statusOrder = { 'critical': 0, 'overtime': 1, 'long': 2, 'attention': 3, 'ok': 4 };
        aVal = statusOrder[a.status as keyof typeof statusOrder] ?? 5;
        bVal = statusOrder[b.status as keyof typeof statusOrder] ?? 5;
        break;
      case 'issue':
        aVal = a.issueKey || '';
        bVal = b.issueKey || '';
        break;
      default:
        aVal = a.startTime || 0;
        bVal = b.startTime || 0;
    }

    if (typeof aVal === 'string') {
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else {
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }
  });

  self.postMessage({
    type: 'SORT_COMPLETE',
    data: sorted
  });
}

// Lightning-fast statistics calculation
async function processStatsRequest({ data, groupBy }: StatsRequest) {
  const stats = {
    totalItems: data.length,
    groups: new Map<string, any>(),
    overall: {
      totalDuration: 0,
      averageDuration: 0,
      criticalCount: 0,
      longestTimer: 0,
      mostActiveUser: '',
      userCounts: new Map<string, number>()
    }
  };

  // Single-pass statistics calculation for maximum performance
  for (const item of data) {
    const duration = item.elapsedMs || 0;
    stats.overall.totalDuration += duration;

    if (duration > stats.overall.longestTimer) {
      stats.overall.longestTimer = duration;
    }

    if (item.status === 'critical') {
      stats.overall.criticalCount++;
    }

    // User statistics
    const userCount = stats.overall.userCounts.get(item.username) || 0;
    stats.overall.userCounts.set(item.username, userCount + 1);

    // Group-by statistics
    const groupKey = item[groupBy] || 'unknown';
    if (!stats.groups.has(groupKey)) {
      stats.groups.set(groupKey, {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        statuses: new Map<string, number>(),
        users: new Set<string>()
      });
    }

    const group = stats.groups.get(groupKey)!;
    group.count++;
    group.totalDuration += duration;
    group.averageDuration = group.totalDuration / group.count;
    group.users.add(item.username);

    const status = item.status || 'unknown';
    group.statuses.set(status, (group.statuses.get(status) || 0) + 1);
  }

  // Calculate overall averages
  stats.overall.averageDuration = stats.overall.totalDuration / Math.max(data.length, 1);

  // Find most active user
  let maxUserCount = 0;
  for (const [username, count] of stats.overall.userCounts) {
    if (count > maxUserCount) {
      maxUserCount = count;
      stats.overall.mostActiveUser = username;
    }
  }

  // Convert Maps to serializable objects
  const result = {
    totalItems: stats.totalItems,
    overall: {
      ...stats.overall,
      userCounts: Object.fromEntries(stats.overall.userCounts)
    },
    groups: Object.fromEntries(
      Array.from(stats.groups.entries()).map(([key, value]) => [
        key,
        {
          ...value,
          statuses: Object.fromEntries(value.statuses),
          users: Array.from(value.users)
        }
      ])
    )
  };

  self.postMessage({
    type: 'STATS_COMPLETE',
    data: result
  });
}

// Keep the worker alive
self.postMessage({ type: 'READY' });