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
  try {
    const response = await apiClient({
      method,
      url: path,
      data,
      ...config,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
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
  return apiClient.post(path, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
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
