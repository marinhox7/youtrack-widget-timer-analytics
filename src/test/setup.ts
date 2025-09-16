/**
 * Test setup configuration for Vitest
 * Configures global test environment, mocks, and utilities
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock global objects that may not be available in test environment
Object.defineProperty(window, 'performance', {
  writable: true,
  value: {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    memory: {
      usedJSHeapSize: 1000000
    }
  }
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: localStorageMock
});

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  writable: true,
  value: localStorageMock
});

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Mock YouTrack host context
global.YTApp = {
  register: vi.fn().mockResolvedValue({
    fetchYouTrack: vi.fn()
  })
};

// Set default test timeout
vi.setConfig({
  testTimeout: 10000
});

// Global test utilities
export const createMockYouTrackHost = () => ({
  fetchYouTrack: vi.fn()
});

export const createMockTimerData = () => ({
  'user1': '1640995200000', // Mock timestamp
  'user2': '1640995800000'  // Mock timestamp
});

export const createMockIssue = (overrides = {}) => ({
  id: 'issue-1',
  summary: 'Test Issue',
  project: { shortName: 'TEST', name: 'Test Project' },
  numberInProject: 1,
  customFields: [
    {
      name: 'Timer Hash Data',
      value: JSON.stringify(createMockTimerData()),
      field: { name: 'Timer Hash Data' }
    }
  ],
  ...overrides
});

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
});