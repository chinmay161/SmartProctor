// Copies the MediaPipe Tasks Vision WASM runtime from node_modules into
// public/mediapipe/<version>/wasm so it is self-hosted (no CDN at exam time)
// and the versioned path busts long-lived caches on upgrade.
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const visionPkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const { version: visionVersion } = JSON.parse(readFileSync(join(visionPkgDir, 'package.json'), 'utf8'));

const audioPkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-audio');
const { version: audioVersion } = JSON.parse(readFileSync(join(audioPkgDir, 'package.json'), 'utf8'));

const VISION_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
  // ES-module loader, used by the object-detection Web Worker.
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
];

const AUDIO_FILES = [
  'audio_wasm_internal.js',
  'audio_wasm_internal.wasm',
  'audio_wasm_nosimd_internal.js',
  'audio_wasm_nosimd_internal.wasm',
  'audio_wasm_module_internal.js',
  'audio_wasm_module_internal.wasm',
];

const outRoot = join(root, 'public', 'mediapipe');
const visionOutDir = join(outRoot, visionVersion, 'wasm');
const audioOutDir = join(outRoot, audioVersion, 'audio');

// Drop runtimes from other versions so stale copies don't ship.
const keepVersions = new Set([visionVersion, audioVersion]);
if (existsSync(outRoot)) {
  for (const entry of readdirSync(outRoot)) {
    if (!keepVersions.has(entry)) rmSync(join(outRoot, entry), { recursive: true, force: true });
  }
}

mkdirSync(visionOutDir, { recursive: true });
for (const file of VISION_FILES) {
  copyFileSync(join(visionPkgDir, 'wasm', file), join(visionOutDir, file));
}
console.log(`[mediapipe] copied tasks-vision ${visionVersion} WASM to public/mediapipe/${visionVersion}/wasm`);

mkdirSync(audioOutDir, { recursive: true });
for (const file of AUDIO_FILES) {
  copyFileSync(join(audioPkgDir, 'wasm', file), join(audioOutDir, file));
}
console.log(`[mediapipe] copied tasks-audio ${audioVersion} WASM to public/mediapipe/${audioVersion}/audio`);

