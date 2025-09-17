import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';

/*
  Vite configuration for YouTrack Timer Dashboard Widget
  See https://vitejs.dev/config/
*/

export default defineConfig({
  plugins: [
    react(),
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
  base: '',
  publicDir: false, // We handle copying manually
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: ['es2022'],
assetsDir: 'assets',
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
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});