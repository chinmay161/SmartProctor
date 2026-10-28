import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { isNativeApp } from '../utils/platform';

let cachedAppVersion = '1.0';

// If running in a native shell, eagerly resolve app version from native package info
if (typeof window !== 'undefined' && isNativeApp()) {
  try {
    App.getInfo()
      .then((info) => {
        if (info?.version && typeof info.version === 'string') {
          cachedAppVersion = info.version.slice(0, 32);
        }
      })
      .catch(() => {
        // Fall back to default cached version
      });
  } catch {
    // Ignore in non-native environments
  }
}

/**
 * Extracts a short webview engine version string from the user agent.
 * Handles Android WebView (Chrome/X.Y.Z.W or Version/X.Y).
 */
export function extractWebViewVersion(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (!ua || typeof ua !== 'string') return 'unknown';

  const chromeMatch = ua.match(/Chrome\/([0-9.]+)/i);
  if (chromeMatch && chromeMatch[1]) {
    return chromeMatch[1].slice(0, 32);
  }

  const versionMatch = ua.match(/Version\/([0-9.]+)/i);
  if (versionMatch && versionMatch[1]) {
    return versionMatch[1].slice(0, 32);
  }

  return 'unknown';
}

/**
 * Returns platform metadata for telemetry and session start events.
 *
 * Rules:
 * - When running natively (Android): returns { platform: 'android', app_version, webview_version }
 * - When running on web: returns { platform: 'web' } (app_version and webview_version omitted)
 *
 * Can accept options to override for unit testing.
 */
export function getPlatformSessionMetadata({
  isNative = isNativeApp(),
  platform = Capacitor.getPlatform(),
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  appVersion = cachedAppVersion,
} = {}) {
  if (isNative) {
    const nativePlatform = platform === 'android' ? 'android' : (platform || 'android');
    return {
      platform: nativePlatform,
      app_version: String(appVersion || '1.0').slice(0, 32),
      webview_version: extractWebViewVersion(userAgent),
    };
  }

  return {
    platform: 'web',
  };
}

/**
 * Allows updating cached app version (used in tests or dynamic initialization).
 */
export function setCachedAppVersion(version) {
  if (typeof version === 'string' && version.trim()) {
    cachedAppVersion = version.trim().slice(0, 32);
  }
}
