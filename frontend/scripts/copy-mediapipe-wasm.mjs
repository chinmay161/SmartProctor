// Copies the MediaPipe Tasks Vision WASM runtime from node_modules into
// public/mediapipe/<version>/wasm so it is self-hosted (no CDN at exam time)
// and the versioned path busts long-lived caches on upgrade.
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

const FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const outRoot = join(root, 'public', 'mediapipe');
const outDir = join(outRoot, version, 'wasm');

// Drop runtimes from other versions so stale copies don't ship.
if (existsSync(outRoot)) {
  for (const entry of readdirSync(outRoot)) {
    if (entry !== version) rmSync(join(outRoot, entry), { recursive: true, force: true });
  }
}

mkdirSync(outDir, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(pkgDir, 'wasm', file), join(outDir, file));
}
console.log(`[mediapipe] copied tasks-vision ${version} WASM to public/mediapipe/${version}/wasm`);
