/**
 * Braip Color System - Project Color Mapping
 */

// Braip color palette
export const BRAIP_COLORS = {
  primary: {
    600: '#6D36FB',
    500: '#8A5EFC',
    400: '#A786FD',
    300: '#C5AFFD',
    200: '#E2D7FE',
    100: '#F4F0FF',
  },
  secondary: {
    600: '#99FF33',
    500: '#ADFF5C',
    400: '#C2FF85',
    300: '#D6FFAD',
    200: '#EBFFD6',
    100: '#F5FFEB',
  },
  red: {
    600: '#FF2E2E',
    500: '#FE5F5F',
  },
  orange: {
    600: '#FF9900',
    500: '#FFAF36',
  },
  yellow: {
    600: '#FFD600',
    500: '#FFE24D',
  },
  blue: {
    600: '#3399FF',
    500: '#6BB5FF',
  },
  green: {
    600: '#5EC34D',
    500: '#72D761',
  },
  pink: {
    600: '#FF3FCE',
    500: '#FF68D9',
  },
  grey: {
    800: '#6D6D76',
    700: '#5B5B61',
    600: '#505057',
    500: '#414146',
    200: '#19191E',
    100: '#0D0D12',
    0: '#0B0B0E',
  },
  light: {
    100: '#F7F7FC',
    200: '#EBEBF8',
    300: '#DCDCF0',
  },
} as const;

// Project color mapping
export const PROJECT_COLORS = [
  BRAIP_COLORS.primary[600],   // Purple
  BRAIP_COLORS.secondary[600], // Green-yellow
  BRAIP_COLORS.orange[600],    // Orange
  BRAIP_COLORS.blue[600],      // Blue
  BRAIP_COLORS.green[600],     // Green
  BRAIP_COLORS.pink[600],      // Pink
  BRAIP_COLORS.yellow[600],    // Yellow
  BRAIP_COLORS.red[600],       // Red
] as const;

// Status colors
export const STATUS_COLORS = {
  ok: BRAIP_COLORS.green[600],
  attention: BRAIP_COLORS.orange[600],
  long: BRAIP_COLORS.yellow[600],
  critical: BRAIP_COLORS.red[600],
} as const;

/**
 * Get color for a project based on its short name or index
 */
export function getProjectColor(projectKey: string | number): string {
  if (typeof projectKey === 'number') {
    return PROJECT_COLORS[projectKey % PROJECT_COLORS.length];
  }

  // Create a consistent hash from project key for consistent colors
  let hash = 0;
  for (let i = 0; i < projectKey.length; i++) {
    const char = projectKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const index = Math.abs(hash) % PROJECT_COLORS.length;
  return PROJECT_COLORS[index];
}

/**
 * Get Chart.js compatible colors for projects
 */
export function getChartColorsForProjects(projectKeys: string[]): string[] {
  return projectKeys.map((key) => getProjectColor(key));
}

/**
 * Get status color
 */
export function getStatusColor(status: keyof typeof STATUS_COLORS): string {
  return STATUS_COLORS[status] || STATUS_COLORS.ok;
}

/**
 * Project color cache to maintain consistency within a session
 */
const projectColorCache = new Map<string, string>();

/**
 * Get cached project color (ensures consistency within session)
 */
export function getCachedProjectColor(projectKey: string): string {
  if (!projectColorCache.has(projectKey)) {
    projectColorCache.set(projectKey, getProjectColor(projectKey));
  }
  return projectColorCache.get(projectKey)!;
}

/**
 * Clear project color cache
 */
export function clearProjectColorCache(): void {
  projectColorCache.clear();
}