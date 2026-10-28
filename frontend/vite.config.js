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

const pkgVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
).version || '1.0.0'

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
  },
  define: {
    'import.meta.env.VITE_MEDIAPIPE_VERSION': JSON.stringify(mediapipeVersion),
    'import.meta.env.VITE_MEDIAPIPE_AUDIO_VERSION': JSON.stringify(mediapipeAudioVersion),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkgVersion),
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
})


