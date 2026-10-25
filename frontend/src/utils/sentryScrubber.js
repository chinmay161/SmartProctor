import * as Sentry from '@sentry/react';
import { getPlatformSessionMetadata } from '../telemetry/platformInfo';

const SENSITIVE_QUERY_REGEX = /(?:^|[?&])(?:token|access_token|code)=/i;
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api', 'x-api-key'];

/**
 * Strips query string from URL if it contains token=, access_token=, or code=.
 * Preserves safe URLs unchanged.
 */
export function scrubUrl(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }
  if (SENSITIVE_QUERY_REGEX.test(url)) {
    return url.split('?')[0];
  }
  return url;
}

/**
 * Scrubs Sentry event:
 * - Drops request.data (request bodies carry base64 images / payload data)
 * - Strips query strings containing sensitive tokens from request.url
 * - Removes Authorization, Cookie, and X-API headers
 * - Scrubs breadcrumb URLs and messages
 */
export function scrubEvent(event) {
  if (!event) return event;
  const scrubbed = { ...event };

  if (scrubbed.request && typeof scrubbed.request === 'object') {
    const req = { ...scrubbed.request };
    // Drop request body
    delete req.data;

    if (typeof req.url === 'string') {
      req.url = scrubUrl(req.url);
    }

    if (typeof req.queryString === 'string' && SENSITIVE_QUERY_REGEX.test(req.queryString)) {
      req.queryString = '';
    }

    if (req.headers && typeof req.headers === 'object') {
      const cleanHeaders = {};
      for (const [key, val] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (!SENSITIVE_HEADERS.includes(lowerKey) && !lowerKey.startsWith('x-api-')) {
          cleanHeaders[key] = val;
        }
      }
      req.headers = cleanHeaders;
    }

    scrubbed.request = req;
  }

  // Scrub breadcrumbs
  if (Array.isArray(scrubbed.breadcrumbs)) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((crumb) => {
      if (!crumb) return crumb;
      const newCrumb = { ...crumb };
      if (newCrumb.data && typeof newCrumb.data === 'object') {
        const newData = { ...newCrumb.data };
        if (typeof newData.url === 'string') {
          newData.url = scrubUrl(newData.url);
        }
        newCrumb.data = newData;
      }
      if (typeof newCrumb.message === 'string' && SENSITIVE_QUERY_REGEX.test(newCrumb.message)) {
        newCrumb.message = scrubUrl(newCrumb.message);
      }
      return newCrumb;
    });
  }

  return scrubbed;
}

/**
 * Initializes Sentry in frontend ONLY if VITE_SENTRY_DSN is set.
 */
export function initFrontendSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) {
    return false;
  }

  const rawRate = import.meta.env.VITE_SENTRY_TRACES_RATE;
  const parsedRate = Number(rawRate);
  const tracesSampleRate = !Number.isNaN(parsedRate) && rawRate !== '' ? parsedRate : 0.05;

  Sentry.init({
    dsn,
    tracesSampleRate,
    tracePropagationTargets: [],
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb(crumb) {
      if (crumb?.data?.url && typeof crumb.data.url === 'string') {
        crumb.data.url = scrubUrl(crumb.data.url);
      }
      if (crumb?.message && typeof crumb.message === 'string' && SENSITIVE_QUERY_REGEX.test(crumb.message)) {
        crumb.message = scrubUrl(crumb.message);
      }
      return crumb;
    },
  });

  // Global unhandledrejection listener
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason || 'Unhandled Promise Rejection'));
      Sentry.captureException(error);
    });
  }

  setNativeSentryTags();
  return true;
}

/**
 * Sets Sentry tag 'role' after profile load.
 * NEVER sets email or name.
 */
export function setSentryRole(role) {
  if (role) {
    try {
      Sentry.setTag('role', String(role));
    } catch {
      // Safe no-op if Sentry is not active
    }
  }
}

/**
 * Sets Sentry tag 'session_id' when known.
 */
export function setSentrySessionId(sessionId) {
  if (sessionId) {
    try {
      Sentry.setTag('session_id', String(sessionId));
    } catch {
      // Safe no-op if Sentry is not active
    }
  }
}

/**
 * Sets native Sentry tags ('platform', 'app_version', 'webview_version')
 * ONLY when running natively.
 */
export function setNativeSentryTags(metadataOverride = null) {
  try {
    const meta = metadataOverride || getPlatformSessionMetadata();
    if (meta && meta.platform && meta.platform !== 'web') {
      Sentry.setTag('platform', String(meta.platform));
      if (meta.app_version) {
        Sentry.setTag('app_version', String(meta.app_version));
      }
      if (meta.webview_version) {
        Sentry.setTag('webview_version', String(meta.webview_version));
      }
      return true;
    }
  } catch {
    // Safe no-op if Sentry is not active
  }
  return false;
}
