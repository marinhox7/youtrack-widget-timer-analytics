import React from 'react';
import { createRoot } from 'react-dom/client';
import ProjectDashboard from './ProjectDashboard';

// Declare YTApp type
declare global {
  interface Window {
    YTApp: {
      register(): Promise<any>;
    };
    host: any;
  }
}

// Widget initialization function
async function initializeWidget() {
  console.log('[Project Dashboard Widget] Initializing...');

  try {
    // Register with YouTrack first
    if (typeof window.YTApp !== 'undefined' && window.YTApp.register) {
      const host = await window.YTApp.register();
      console.log('[Project Dashboard Widget] Successfully registered with YouTrack', !!host);

      // Now initialize React app
      const container = document.getElementById('app');
      if (container) {
        const root = createRoot(container);
        root.render(
          <React.StrictMode>
            <ProjectDashboard host={host} />
          </React.StrictMode>
        );
      } else {
        console.error('[Project Dashboard Widget] Could not find app container');
      }
    } else {
      console.error('[Project Dashboard Widget] YTApp.register not available');
    }
  } catch (error) {
    console.error('[Project Dashboard Widget] Failed to register with YouTrack:', error);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWidget);
} else {
  initializeWidget();
}