import { readFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Versioned, self-hosted WASM path (see scripts/copy-mediapipe-wasm.mjs).
const mediapipeVersion = JSON.parse(
  readFileSync(new URL('./node_modules/@mediapipe/tasks-vision/package.json', import.meta.url), 'utf8')
).version
const mediapipeAudioVersion = JSON.parse(
  readFileSync(new URL('./node_modules/@mediapipe/tasks-audio/package.json', import.meta.url), 'utf8')
).version

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim()
const sentryOrg = process.env.SENTRY_ORG?.trim()
const sentryProject = process.env.SENTRY_PROJECT?.trim()
const hasSentryConfig = Boolean(sentryAuthToken && sentryOrg && sentryProject)

function cleanSourcemapsPlugin() {
  return {
    name: 'clean-sourcemaps',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      function removeMaps(dir) {
        if (!existsSync(dir)) return
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            removeMaps(fullPath)
          } else if (entry.name.endsWith('.map')) {
            unlinkSync(fullPath)
          }
        }
      }
      removeMaps(distDir)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    ...(hasSentryConfig
      ? [
          sentryVitePlugin({
            org: sentryOrg,
            project: sentryProject,
            authToken: sentryAuthToken,
            sourcemaps: {
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
          }),
        ]
      : []),
    cleanSourcemapsPlugin(),
  ],
  build: {
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('@sentry')) {
              return 'vendor-sentry';
            }
            if (id.includes('@auth0')) {
              return 'vendor-auth0';
            }
            if (id.includes('lucide-react') || id.includes('@radix-ui') || id.includes('radix-ui')) {
              return 'vendor-ui';
            }
          }
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_MEDIAPIPE_VERSION': JSON.stringify(mediapipeVersion),
    'import.meta.env.VITE_MEDIAPIPE_AUDIO_VERSION': JSON.stringify(mediapipeAudioVersion),
  },
})
