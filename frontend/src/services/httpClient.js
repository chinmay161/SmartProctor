/**
 * HTTP Client with Token Management and Interceptors
 * Automatically handles token attachment, refresh, and error handling
 */

import axios from 'axios';
import { TokenStorage, sessionEvents } from './tokenStorage';

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
 * Request queue for handling concurrent token refreshes
 * Prevents multiple simultaneous refresh requests
 */
let isRefreshing = false;
let refreshSubscribers = [];

const onRefreshed = (token) => {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (callback) => {
  refreshSubscribers.push(callback);
};

/**
 * Request Interceptor
 * Attaches access token to all requests
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = TokenStorage.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handles token expiration and refresh
 */
apiClient.interceptors.response.use(
  // Success response
  (response) => {
    return response;
  },

  // Error response
  async (error) => {
    const originalRequest = error.config;

    // Check if error is 401 (Unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry login or logout endpoints
      if (
        originalRequest.url?.includes('/login') ||
        originalRequest.url?.includes('/logout') ||
        originalRequest.url?.includes('/refresh')
      ) {
        // Clear tokens and emit logout event
        TokenStorage.clearTokens();
        sessionEvents.emit('unauthorized', { error: error.response.data });
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Token refresh already in progress, queue this request
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      // Mark that we're refreshing
      isRefreshing = true;
      originalRequest._retry = true;

      try {
        // Attempt to refresh token
        const refreshToken = TokenStorage.getRefreshToken();
        const sessionId = TokenStorage.getSessionId();

        if (!refreshToken || !sessionId) {
          throw new Error('No refresh token available');
        }

        const refreshResponse = await axios.post(`${API_BASE}/api/sessions/refresh`, {
          session_id: sessionId,
          refresh_token: refreshToken,
        });

        const { access_token, access_token_expires_at } = refreshResponse.data;

        // Save new token
        TokenStorage.saveTokens(access_token, refreshToken, {
          session_id: sessionId,
          access_token_expires_at,
        });

        // Update Authorization header
        apiClient.defaults.headers.common.Authorization = `Bearer ${access_token}`;
        originalRequest.headers.Authorization = `Bearer ${access_token}`;

        // Emit refresh event
        sessionEvents.emit('tokenRefreshed', {
          expiresAt: access_token_expires_at,
        });

        // Notify queued requests
        isRefreshing = false;
        onRefreshed(access_token);

        // Retry original request with new token
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        isRefreshing = false;
        TokenStorage.clearTokens();
        sessionEvents.emit('sessionExpired', {
          error: refreshError.response?.data || refreshError.message,
        });

        // You can add logic here to redirect to login page
        return Promise.reject(refreshError);
      }
    }

    // Check if error is 403 (Forbidden)
    if (error.response?.status === 403) {
      sessionEvents.emit('forbidden', {
        message: error.response.data?.detail || 'Access forbidden',
      });
    }

    // Check if error is 404 (Not Found)
    if (error.response?.status === 404) {
      sessionEvents.emit('notFound', {
        message: error.response.data?.detail || 'Resource not found',
      });
    }

    return Promise.reject(error);
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
  isRefreshing = false;
  refreshSubscribers = [];
};

export default apiClient;
