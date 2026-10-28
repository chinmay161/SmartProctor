import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let apiBase = process.env.VITE_API_BASE?.trim();
let nativeClientId = process.env.VITE_AUTH0_NATIVE_CLIENT_ID?.trim();

if (!apiBase || !nativeClientId) {
  const envFiles = ['.env.production.local', '.env.local', '.env.production', '.env'];
  for (const file of envFiles) {
    const fullPath = join(root, file);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const apiMatch = trimmed.match(/^VITE_API_BASE\s*=\s*(.*)$/);
        if (apiMatch && !apiBase) {
          apiBase = apiMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }
        const clientMatch = trimmed.match(/^VITE_AUTH0_NATIVE_CLIENT_ID\s*=\s*(.*)$/);
        if (clientMatch && !nativeClientId) {
          nativeClientId = clientMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }
      }
      if (apiBase && nativeClientId) break;
    }
  }
}

if (!apiBase) {
  console.error('\n[check-native-env] FATAL: VITE_API_BASE is missing.');
  console.error('Android builds require an explicit backend URL starting with https:// (e.g. VITE_API_BASE=https://api.example.com).\n');
  process.exit(1);
}

if (!apiBase.startsWith('https://')) {
  console.error(`\n[check-native-env] FATAL: VITE_API_BASE must start with 'https://' for Android builds.`);
  console.error(`Received a non-https URL. Plain http:// or localhost cannot be reached from an Android device or emulator.\n`);
  process.exit(1);
}

if (!nativeClientId) {
  console.error('\n[check-native-env] FATAL: VITE_AUTH0_NATIVE_CLIENT_ID is missing.');
  console.error('Android builds require VITE_AUTH0_NATIVE_CLIENT_ID to authenticate via Auth0 native client.\n');
  process.exit(1);
}

console.log('[check-native-env] Environment variables valid for Android build:');
console.log('  - VITE_API_BASE is valid (starts with https://)');
console.log('  - VITE_AUTH0_NATIVE_CLIENT_ID is present');
process.exit(0);
