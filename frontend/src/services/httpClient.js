/**
 * HTTP Client with Auth0 token attachment and 401 handling
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

/**
 * Create axios instance with default config
 */
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Auth hooks registered once from inside Auth0Provider (see SessionContext).
 * accessTokenProvider(options) -> Promise<string>, e.g. a wrapped getAccessTokenSilently.
 * loginRedirectHandler(options) -> starts Auth0 loginWithRedirect.
 */
let accessTokenProvider = null;
let loginRedirectHandler = null;
let hasRedirectedToLogin = false;
let tokenErrorActive = false;

export const setAccessTokenProvider = (provider) => {
  accessTokenProvider = typeof provider === 'function' ? provider : null;
};

export const setLoginRedirectHandler = (handler) => {
  loginRedirectHandler = typeof handler === 'function' ? handler : null;
};

const getAccessToken = async (options) => {
  if (!accessTokenProvider) return null;
  try {
    return await accessTokenProvider(options);
  } catch {
    // login_required / not authenticated: send the request without a token.
    return null;
  }
};

const isExamPortalRoute = (pathname) => pathname === '/exam-portal' || pathname.startsWith('/exam-portal/');

/**
 * Called when a request is still unauthorized after one retry with a fresh token.
 * Exam portal never redirects (it would lose the exam); it gets an event instead.
 */
const handleAuthFailure = () => {
  const { pathname, search } = window.location;

  if (isExamPortalRoute(pathname)) {
    tokenErrorActive = true;
    window.dispatchEvent(new CustomEvent('auth:token-error'));
    return;
  }

  if (hasRedirectedToLogin || pathname === '/' || pathname === '/login' || !loginRedirectHandler) {
    return;
  }

  hasRedirectedToLogin = true;
  loginRedirectHandler({ appState: { returnTo: `${pathname}${search}` } });
};

/**
 * Request Interceptor
 * Attaches the Auth0 access token unless the caller already set Authorization.
 * Never rejects because of a token fetch failure.
 */
apiClient.interceptors.request.use(async (config) => {
  if (!config.headers) {
    config.headers = {};
  }
  if (!config.headers['X-Request-ID']) {
    const genId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `req-${Math.random().toString(36).slice(2, 11)}`;
    config.headers['X-Request-ID'] = genId;
  }
  if (!config.headers?.Authorization) {
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/**
 * Response Interceptor
 * On 401: retry once with a freshly fetched token, then hand off to handleAuthFailure.
 */
apiClient.interceptors.response.use(
  (response) => {
    if (tokenErrorActive) {
      tokenErrorActive = false;
      window.dispatchEvent(new CustomEvent('auth:token-recovered'));
    }
    return response;
  },

  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    if (originalRequest._authRetry) {
      handleAuthFailure();
      return Promise.reject(error);
    }

    originalRequest._authRetry = true;
    const freshToken = await getAccessToken({ cacheMode: 'off' });
    if (!freshToken) {
      handleAuthFailure();
      return Promise.reject(error);
    }

    originalRequest.headers.Authorization = `Bearer ${freshToken}`;
    return apiClient(originalRequest);
  }
);

/**
 * Make authenticated API request
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} path - API path
 * @param {object} data - Request body data
 * @param {object} config - Additional axios config
 * @returns {Promise}
 */
export const apiRequest = async (method, path, data = null, config = {}) => {
  const customHeaders = { ...(config.headers || {}) };
  if (!customHeaders['X-Request-ID']) {
    const genId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `req-${Math.random().toString(36).slice(2, 11)}`;
    customHeaders['X-Request-ID'] = genId;
  }
  const requestId = customHeaders['X-Request-ID'];

  try {
    const response = await apiClient({
      method,
      url: path,
      data,
      ...config,
      headers: customHeaders,
    });
    return response.data;
  } catch (error) {
    const resRequestId = error.response?.headers?.['x-request-id'] ||
      error.config?.headers?.['X-Request-ID'] ||
      requestId;

    if (error.response?.data) {
      const payload = error.response.data;
      if (typeof payload === 'object' && payload !== null) {
        payload.requestId = resRequestId;
        if (typeof payload.detail === 'string' && !payload.detail.includes('request id:')) {
          payload.detail = `${payload.detail} (request id: ${resRequestId})`;
        }
        if (typeof payload.message === 'string' && !payload.message.includes('request id:')) {
          payload.message = `${payload.message} (request id: ${resRequestId})`;
        }
        throw payload;
      }
      const rawText = String(payload);
      throw rawText.includes('request id:') ? rawText : `${rawText} (request id: ${resRequestId})`;
    }

    const baseMsg = error.message || 'API request failed';
    const err = new Error(baseMsg.includes('request id:') ? baseMsg : `${baseMsg} (request id: ${resRequestId})`);
    err.requestId = resRequestId;
    throw err;
  }
};

/**
 * GET request
 */
export const apiGet = (path, config = {}) => {
  return apiRequest('GET', path, null, config);
};

/**
 * POST request
 */
export const apiPost = (path, data = null, config = {}) => {
  return apiRequest('POST', path, data, config);
};

/**
 * PUT request
 */
export const apiPut = (path, data = null, config = {}) => {
  return apiRequest('PUT', path, data, config);
};

/**
 * DELETE request
 */
export const apiDelete = (path, config = {}) => {
  return apiRequest('DELETE', path, null, config);
};

/**
 * PATCH request
 */
export const apiPatch = (path, data = null, config = {}) => {
  return apiRequest('PATCH', path, data, config);
};

/**
 * Upload file with multipart/form-data
 */
export const apiUpload = (path, formData, onProgress = null) => {
  const requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `req-${Math.random().toString(36).slice(2, 11)}`;
  return apiClient.post(path, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'X-Request-ID': requestId,
    },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  }).catch((error) => {
    const resRequestId = error.response?.headers?.['x-request-id'] || requestId;
    if (error.response?.data && typeof error.response.data === 'object') {
      error.response.data.requestId = resRequestId;
      if (typeof error.response.data.detail === 'string' && !error.response.data.detail.includes('request id:')) {
        error.response.data.detail = `${error.response.data.detail} (request id: ${resRequestId})`;
      }
      if (typeof error.response.data.message === 'string' && !error.response.data.message.includes('request id:')) {
        error.response.data.message = `${error.response.data.message} (request id: ${resRequestId})`;
      }
    }
    error.requestId = resRequestId;
    throw error;
  });
};

/**
 * Set custom header (e.g., for special endpoints)
 */
export const setCustomHeader = (key, value) => {
  apiClient.defaults.headers.common[key] = value;
};

/**
 * Remove custom header
 */
export const removeCustomHeader = (key) => {
  delete apiClient.defaults.headers.common[key];
};

/**
 * Reset API client (clear all custom config)
 */
export const resetApiClient = () => {
  apiClient.defaults.headers.common = {};
};

export default apiClient;
