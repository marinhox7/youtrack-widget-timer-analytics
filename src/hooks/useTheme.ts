/**
 * Theme hook for YouTrack widget theme management
 * Detects YouTrack theme and provides theme switching functionality
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

export type Theme = 'light' | 'dark' | 'auto';

interface ThemeState {
  currentTheme: Theme;
  isDark: boolean;
  isYouTrackDark: boolean;
  isSystemDark: boolean;
}

interface UseThemeReturn extends ThemeState {
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  applyTheme: (theme: Theme) => void;
}

/**
 * Detect YouTrack's current theme by analyzing CSS variables and DOM
 */
const detectYouTrackTheme = (): boolean => {
  // Method 1: Check YouTrack's CSS custom properties
  if (typeof window !== 'undefined') {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);

    // YouTrack uses these CSS variables for theming
    const bgColor = computedStyle.getPropertyValue('--ring-content-background-color') ||
                   computedStyle.getPropertyValue('--yt-background-color') ||
                   computedStyle.getPropertyValue('--background-color');

    const textColor = computedStyle.getPropertyValue('--ring-text-color') ||
                     computedStyle.getPropertyValue('--yt-text-color') ||
                     computedStyle.getPropertyValue('--text-color');

    // If we can detect colors, analyze them
    if (bgColor || textColor) {
      // Convert color to RGB values for analysis
      const testElement = document.createElement('div');
      testElement.style.color = bgColor || textColor;
      document.body.appendChild(testElement);
      const computedColor = getComputedStyle(testElement).color;
      document.body.removeChild(testElement);

      // Extract RGB values
      const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch.map(Number);
        // Calculate luminance to determine if dark
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5; // Dark if luminance is low
      }
    }

    // Method 2: Check for YouTrack dark theme classes
    const body = document.body;
    const html = document.documentElement;

    const darkThemeIndicators = [
      'dark-theme',
      'yt-dark',
      'youtrack-dark',
      'dark-mode',
      'theme-dark'
    ];

    for (const indicator of darkThemeIndicators) {
      if (body.classList.contains(indicator) || html.classList.contains(indicator)) {
        return true;
      }
    }

    // Method 3: Check data attributes
    const themeAttr = html.getAttribute('data-theme') ||
                     body.getAttribute('data-theme') ||
                     html.getAttribute('data-yt-theme');

    if (themeAttr && themeAttr.includes('dark')) {
      return true;
    }

    // Method 4: Analyze background color of YouTrack elements
    const ytElements = [
      '.ring-header',
      '.yt-header',
      '#header',
      '.main-header',
      '.app-header'
    ];

    for (const selector of ytElements) {
      const element = document.querySelector(selector);
      if (element) {
        const style = getComputedStyle(element);
        const bgColor = style.backgroundColor;

        if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
          const testDiv = document.createElement('div');
          testDiv.style.backgroundColor = bgColor;
          document.body.appendChild(testDiv);
          const computed = getComputedStyle(testDiv).backgroundColor;
          document.body.removeChild(testDiv);

          const rgbMatch = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (rgbMatch) {
            const [, r, g, b] = rgbMatch.map(Number);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance < 0.5;
          }
        }
      }
    }
  }

  // Fallback to system preference
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

/**
 * Detect system theme preference
 */
const detectSystemTheme = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

/**
 * Apply theme to widget container
 */
const applyThemeToWidget = (theme: Theme, container?: HTMLElement | null) => {
  if (typeof window === 'undefined') return;

  const targetElement = container || document.querySelector('.widget-container.timer-analytics');
  if (!targetElement) return;

  // Remove existing theme classes
  targetElement.classList.remove('theme-light', 'theme-dark', 'theme-auto');

  // Add new theme class
  targetElement.classList.add(`theme-${theme}`);

  // Set data attribute for CSS targeting
  targetElement.setAttribute('data-theme', theme);

  // Apply actual theme based on logic
  let isDark = false;

  switch (theme) {
    case 'dark':
      isDark = true;
      break;
    case 'light':
      isDark = false;
      break;
    case 'auto':
      isDark = detectYouTrackTheme();
      break;
  }

  // Set final theme class
  targetElement.classList.toggle('dark', isDark);
  targetElement.classList.toggle('light', !isDark);
};

export const useTheme = (): UseThemeReturn => {
  const [currentTheme, setCurrentTheme] = useState<Theme>('auto');
  const [isYouTrackDark, setIsYouTrackDark] = useState(false);
  const [isSystemDark, setIsSystemDark] = useState(false);

  // Determine if current effective theme is dark
  const isDark = useMemo(() => {
    switch (currentTheme) {
      case 'dark':
        return true;
      case 'light':
        return false;
      case 'auto':
        return isYouTrackDark;
      default:
        return false;
    }
  }, [currentTheme, isYouTrackDark]);

  // Detect themes on mount and when they change
  useEffect(() => {
    const updateThemes = () => {
      setIsYouTrackDark(detectYouTrackTheme());
      setIsSystemDark(detectSystemTheme());
    };

    // Initial detection
    updateThemes();

    // Watch for system theme changes
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (mediaQuery) {
      const handler = (e: MediaQueryListEvent) => {
        setIsSystemDark(e.matches);
      };

      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);

  // Watch for YouTrack theme changes (MutationObserver)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new MutationObserver(() => {
      const newYouTrackTheme = detectYouTrackTheme();
      if (newYouTrackTheme !== isYouTrackDark) {
        setIsYouTrackDark(newYouTrackTheme);
      }
    });

    // Observe changes to html and body classes/attributes
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-yt-theme']
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-yt-theme']
    });

    return () => observer.disconnect();
  }, [isYouTrackDark]);

  // Apply theme whenever it changes
  useEffect(() => {
    applyThemeToWidget(currentTheme);
  }, [currentTheme, isYouTrackDark, isSystemDark]);

  // Load saved theme preference (with fallback for sandboxed environments)
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('timer-analytics-theme') as Theme;
      if (savedTheme && ['light', 'dark', 'auto'].includes(savedTheme)) {
        setCurrentTheme(savedTheme);
      }
    } catch (error) {
      // localStorage not available in sandboxed environment, use default 'auto'
      console.warn('localStorage not available, using default theme: auto');
      setCurrentTheme('auto');
    }
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
    try {
      localStorage.setItem('timer-analytics-theme', theme);
    } catch (error) {
      // localStorage not available in sandboxed environment, continue without persistence
      console.warn('localStorage not available, theme preference will not persist');
    }
    applyThemeToWidget(theme);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
  }, [isDark, setTheme]);

  const applyTheme = useCallback((theme: Theme) => {
    applyThemeToWidget(theme);
  }, []);

  return {
    currentTheme,
    isDark,
    isYouTrackDark,
    isSystemDark,
    setTheme,
    toggleTheme,
    applyTheme
  };
};

export default useTheme;