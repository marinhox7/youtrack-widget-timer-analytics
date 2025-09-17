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
        // Copy widget HTML files - only timer-analytics
        {
          src: 'widgets/timer-analytics/index.html',
          dest: 'widgets/timer-analytics/'
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
        'analytics-main': resolve('./src/widgets/timer-analytics/index.tsx')
      },
      output: {
        entryFileNames: () => {
          return 'widgets/timer-analytics/[name].js';
        },
        chunkFileNames: () => {
          return 'widgets/timer-analytics/[name]-[hash].js';
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'widgets/timer-analytics/[name]-[hash].[ext]';
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
