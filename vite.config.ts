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
        }
      ]
    }),
viteStaticCopy({
      targets: [
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
          src: 'widgets/timer-dashboard/icon.svg',
          dest: 'widgets/timer-dashboard/'
        },
        {
          src: 'widgets/timer-dashboard/styles.css',
          dest: 'widgets/timer-dashboard/'
        }
      ],
      structured: false
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
        'project-settings-main': resolve('./src/widgets/timer-dashboard/project-settings/index.tsx')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});