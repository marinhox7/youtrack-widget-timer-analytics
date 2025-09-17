import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig({
  plugins: [
    react(),
    cssInjectedByJsPlugin(),
    viteStaticCopy({
      targets: [
        // Copy manifest and icon from root
        {
          src: '../manifest.json',
          dest: '.'
        },
        {
          src: '../public/icon.svg',
          dest: '.'
        },
        // Copy backend.js if exists
        {
          src: 'backend.js',
          dest: '.'
        },
        // Copy widget HTML files
        {
          src: 'widgets/timer-dashboard/index.html',
          dest: 'widgets/timer-dashboard/'
        },
        {
          src: 'widgets/timer-dashboard/project-settings/index.html',
          dest: 'widgets/timer-dashboard/project-settings/'
        },
        {
          src: 'widgets/timer-analytics/index.html',
          dest: 'widgets/timer-analytics/'
        },
        {
          src: 'widgets/user-timer/index.html',
          dest: 'widgets/user-timer/'
        },
        {
          src: 'widgets/project-dashboard/index.html',
          dest: 'widgets/project-dashboard/'
        },
        {
          src: 'widgets/user-timer/compact/index.html',
          dest: 'widgets/user-timer/compact/'
        }
      ]
    })
  ],
  root: './src',
  base: './', // relative base for YouTrack
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: ['es2022'],
    assetsDir: 'assets',
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve('./src/widgets/timer-dashboard/index.tsx'),
        'project-settings-main': resolve('./src/widgets/timer-dashboard/project-settings/index.tsx'),
        'analytics-main': resolve('./src/widgets/timer-analytics/index.tsx'),
        'user-timer-main': resolve('./src/widgets/user-timer/index.tsx'),
        'project-dashboard-main': resolve('./src/widgets/project-dashboard/index.tsx'),
        'user-timer-compact-main': resolve('./src/widgets/user-timer/compact/index.tsx')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          const facadeModuleId = (chunkInfo as any).facadeModuleId as string | undefined;
          if (facadeModuleId?.includes('timer-analytics')) {
            return 'widgets/timer-analytics/[name].js';
          }
          if (facadeModuleId?.includes('user-timer/compact')) {
            return 'widgets/user-timer/compact/[name].js';
          }
          if (facadeModuleId?.includes('user-timer')) {
            return 'widgets/user-timer/[name].js';
          }
          if (facadeModuleId?.includes('project-dashboard')) {
            return 'widgets/project-dashboard/[name].js';
          }
          if (facadeModuleId?.includes('project-settings')) {
            return 'widgets/timer-dashboard/project-settings/[name].js';
          }
          return 'widgets/timer-dashboard/[name].js';
        },
        chunkFileNames: () => {
          return 'widgets/timer-dashboard/[name]-[hash].js';
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            const name = assetInfo.name || '';
            if (name.includes('analytics')) {
              return 'widgets/timer-analytics/[name]-[hash].[ext]';
            }
            if (name.includes('UserTimer')) {
              return 'widgets/user-timer/[name]-[hash].[ext]';
            }
            if (name.includes('ProjectDashboard')) {
              return 'widgets/project-dashboard/[name]-[hash].[ext]';
            }
            return 'widgets/timer-dashboard/[name]-[hash].[ext]';
          }
          return 'assets/[name]-[hash].[ext]';
        }
      }
    }
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});
