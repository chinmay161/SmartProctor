/* global __APP_VERSION__ */
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

/**
 * Returns true if running inside a native mobile shell (Android or iOS via Capacitor).
 */
export const isNativeApp = () => Capacitor.isNativePlatform();

/**
 * Shared helper for opening Auth0 URLs via the system browser in Capacitor.
 * When native, opens the URL using @capacitor/browser.
 */
export const openUrl = async (url) => {
  if (isNativeApp()) {
    await Browser.open({ url });
  } else if (typeof window !== 'undefined') {
    window.location.assign(url);
  }
};

/**
 * Generates the native Auth0 custom-scheme callback URL for deep linking.
 * Format: io.smartproctor.exam://${domain}/capacitor/io.smartproctor.exam/callback
 */
export const getNativeCallbackUrl = (domain) => {
  const cleanDomain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `io.smartproctor.exam://${cleanDomain}/capacitor/io.smartproctor.exam/callback`;
};

/**
 * Processes incoming deep link URLs for Auth0 authentication.
 * If the URL contains state and (code or error), calls handleRedirectCallback(url),
 * closes the in-app browser, and navigates to appState.returnTo (or role home).
 */
export const processAppUrl = async (
  url,
  { handleRedirectCallback, navigate, closeBrowser = () => Browser.close() }
) => {
  if (!url) return;

  const hasState = url.includes('state=');
  const hasCodeOrError = url.includes('code=') || url.includes('error=');

  if (hasState && hasCodeOrError) {
    let returnTo = null;
    try {
      const res = await handleRedirectCallback(url);
      returnTo = res?.appState?.returnTo;
    } catch (err) {
      console.error('[NativeAuth] handleRedirectCallback failed:', err);
    } finally {
      try {
        await closeBrowser();
      } catch {
        // Ignore if browser was already closed
      }
    }

    if (returnTo && typeof returnTo === 'string') {
      navigate(returnTo, { replace: true });
    } else {
      navigate('/student-dashboard', { replace: true });
    }
  } else if (url.includes('/callback')) {
    // Auth0 logout redirect or return
    try {
      await closeBrowser();
    } catch {
      // Ignore
    }
    navigate('/login', { replace: true });
  }
};

/**
 * Sets the native system status bar icon style to follow the app's theme.
 * Dark app theme -> SystemBarsStyle.Dark (light icons on dark background)
 * Light app theme -> SystemBarsStyle.Light (dark icons on light background)
 */
export const setSystemBarTheme = async (theme) => {
  if (!isNativeApp()) return;
  try {
    await SystemBars.setStyle({
      style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    });
  } catch {
    // Ignore when SystemBars plugin or platform is unavailable
  }
};

/**
 * Returns the application version string.
 * On native shells, queries App.getInfo() (e.g. from Android build version).
 * On web, returns package version from build configuration.
 */
export const getAppVersion = async () => {
  if (isNativeApp()) {
    try {
      const info = await App.getInfo();
      if (info?.version) {
        return info.version.startsWith('v') ? info.version : `v${info.version}`;
      }
    } catch {
      // Fall through to web version
    }
  }
  const webVersion = (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__)
    ? __APP_VERSION__
    : (import.meta.env?.VITE_APP_VERSION || '1.0.0');
  return webVersion.startsWith('v') ? webVersion : `v${webVersion}`;
};

export default isNativeApp;
