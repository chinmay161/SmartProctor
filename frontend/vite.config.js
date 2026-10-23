import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Versioned, self-hosted WASM path (see scripts/copy-mediapipe-wasm.mjs).
const mediapipeVersion = JSON.parse(
  readFileSync(new URL('./node_modules/@mediapipe/tasks-vision/package.json', import.meta.url), 'utf8')
).version
const mediapipeAudioVersion = JSON.parse(
  readFileSync(new URL('./node_modules/@mediapipe/tasks-audio/package.json', import.meta.url), 'utf8')
).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()
  ],
  define: {
    'import.meta.env.VITE_MEDIAPIPE_VERSION': JSON.stringify(mediapipeVersion),
    'import.meta.env.VITE_MEDIAPIPE_AUDIO_VERSION': JSON.stringify(mediapipeAudioVersion),
  },
})

