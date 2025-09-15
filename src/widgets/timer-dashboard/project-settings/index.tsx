import React from 'react';
import {createRoot} from 'react-dom/client';
import TimerDashboard from '../TimerDashboard';

// Declare YTApp type
declare global {
  interface Window {
    YTApp: {
      register(): Promise<any>;
    };
    host: any;
  }
}

// Project Settings Widget initialization function
async function initializeWidget() {
  console.log('[Timer Dashboard Project Settings Widget] Initializing...');

  try {
    // Register with YouTrack first
    if (typeof window.YTApp !== 'undefined' && window.YTApp.register) {
      const host = await window.YTApp.register();
      console.log('[Timer Dashboard Project Settings Widget] Successfully registered with YouTrack', !!host);

      // Now initialize React app
      const container = document.getElementById('app');
      if (container) {
        const root = createRoot(container);
        root.render(
          <React.StrictMode>
            <TimerDashboard
              host={host}
              refreshInterval={30000}
            />
          </React.StrictMode>
        );
      } else {
        console.error('[Timer Dashboard Project Settings Widget] Could not find app container');
      }
    } else {
      console.error('[Timer Dashboard Project Settings Widget] YTApp.register not available');
    }
  } catch (error) {
    console.error('[Timer Dashboard Project Settings Widget] Failed to register with YouTrack:', error);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWidget);
} else {
  initializeWidget();
}