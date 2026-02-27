/**
 * Authentication Service
 * Handles login, logout, token refresh, and session operations
 */

import { apiPost, apiGet } from './httpClient';
import { TokenStorage, sessionEvents, TabSynchronizer } from './tokenStorage';

/**
 * Login user and create session
 * @param {string} userId - User ID (from Auth0 or local auth)
 * @param {boolean} isMobile - Whether this is a mobile device
 * @param {string} deviceName - Optional device name
 * @returns {Promise<object>} Session data with tokens
 */
export const loginUser = async (userId, password = null, isMobile = false, deviceName = null) => {
  try {
    const body = {
      user_id: userId,
      is_mobile: isMobile,
      device_name: deviceName,
    };

    if (password) body.password = password;

    const response = await apiPost('/api/sessions/login', body);

    // Save tokens and session data
    TokenStorage.saveTokens(
      response.access_token,
      response.refresh_token,
      {
        session_id: response.session_id,
        user_id: userId,
        access_token_expires_at: response.access_token_expires_at,
        refresh_token_expires_at: response.refresh_token_expires_at,
      }
    );

    // Broadcast login to other tabs
    TabSynchronizer.broadcastLogin();

    // Emit login event
    sessionEvents.emit('login', {
      userId,
      sessionId: response.session_id,
    });

    return {
      success: true,
      sessionId: response.session_id,
      userId,
      expiresIn: response.expires_in,
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
};

/**
 * Logout user and invalidate session
 * @param {boolean} allDevices - If true, logout from all devices
 * @returns {Promise<object>} Logout confirmation
 */
export const logoutUser = async (allDevices = false) => {
  try {
    const sessionId = TokenStorage.getSessionId();

    if (!sessionId) {
      throw new Error('No active session');
    }

    // Call logout endpoint
    await apiPost('/api/sessions/logout', {
      session_id: sessionId,
      all_devices: allDevices,
    });

    // Clear tokens
    TokenStorage.clearTokens();

    // Broadcast logout to other tabs
    TabSynchronizer.broadcastLogout();

    // Emit logout event
    sessionEvents.emit('logout', {
      allDevices,
    });

    return {
      success: true,
      message: 'Logged out successfully',
    };
  } catch (error) {
    // Clear tokens even if logout fails
    TokenStorage.clearTokens();
    sessionEvents.emit('logoutError', { error });
    throw error;
  }
};

/**
 * Get current session information
 * @returns {Promise<object>} Current session details
 */
export const getCurrentSession = async () => {
  try {
    const session = await apiGet('/api/sessions/current');
    return session;
  } catch (error) {
    console.error('Failed to get current session:', error);
    throw error;
  }
};

/**
 * Get all active sessions for current user
 * @returns {Promise<object>} List of active sessions
 */
export const getActiveSessions = async () => {
  try {
    const sessions = await apiGet('/api/sessions/active');
    return sessions;
  } catch (error) {
    console.error('Failed to get active sessions:', error);
    throw error;
  }
};

/**
 * Revoke a specific session
 * @param {string} sessionId - Session ID to revoke
 * @returns {Promise<object>} Revocation confirmation
 */
export const revokeSession = async (sessionId) => {
  try {
    const response = await apiPost(`/api/sessions/${sessionId}`, null, {
      method: 'DELETE',
    });
    return response;
  } catch (error) {
    console.error('Failed to revoke session:', error);
    throw error;
  }
};

/**
 * Get session audit log
 * @param {string} sessionId - Session ID
 * @returns {Promise<object>} Audit log entries
 */
export const getSessionAuditLog = async (sessionId) => {
  try {
    const auditLog = await apiGet(`/api/sessions/audit/${sessionId}`);
    return auditLog;
  } catch (error) {
    console.error('Failed to get audit log:', error);
    throw error;
  }
};

/**
 * Check if user is authenticated
 * Checks for valid tokens in storage
 * @returns {boolean} True if authenticated
 */
export const isAuthenticated = () => {
  return TokenStorage.hasTokens() && !TokenStorage.isAccessTokenExpired(300); // 5 min buffer
};

/**
 * Get current user ID from session
 * @returns {string|null} User ID or null
 */
export const getCurrentUserId = () => {
  return TokenStorage.getUserId();
};

/**
 * Get current session ID
 * @returns {string|null} Session ID or null
 */
export const getCurrentSessionId = () => {
  return TokenStorage.getSessionId();
};

/**
 * Check if access token needs refresh
 * @param {number} bufferSeconds - Buffer time (default 5 min)
 * @returns {boolean} True if token needs refresh
 */
export const needsTokenRefresh = (bufferSeconds = 300) => {
  return TokenStorage.isAccessTokenExpired(bufferSeconds);
};

/**
 * Get time remaining for access token
 * @returns {number} Seconds remaining
 */
export const getTokenTimeRemaining = () => {
  return TokenStorage.getAccessTokenTimeRemaining();
};

/**
 * Check if refresh token is expired
 * @returns {boolean} True if refresh token is expired
 */
export const isRefreshTokenExpired = () => {
  return TokenStorage.isRefreshTokenExpired();
};

/**
 * Listener for session events
 * Useful for components that need to react to auth changes
 * @param {function} callback - Function to call on session event
 * @returns {function} Unsubscribe function
 */
export const onSessionChange = (callback) => {
  const unsubLogin = sessionEvents.on('login', callback);
  const unsubLogout = sessionEvents.on('logout', callback);
  const unsubExpired = sessionEvents.on('sessionExpired', callback);

  return () => {
    unsubLogin();
    unsubLogout();
    unsubExpired();
  };
};

/**
 * Initialize session management
 * Should be called on app startup
 */
export const initializeSession = () => {
  // Initialize tab synchronization
  TabSynchronizer.init();

  // Check if tokens are still valid
  if (TokenStorage.hasTokens()) {
    // Check access token expiration
    if (TokenStorage.isAccessTokenExpired(300)) {
      // Token will expire soon, but let API interceptor handle refresh
      console.log('Access token expires soon, will refresh on next request');
    }

    // Check refresh token expiration
    if (TokenStorage.isRefreshTokenExpired()) {
      console.log('Refresh token expired, clearing session');
      TokenStorage.clearTokens();
      sessionEvents.emit('sessionExpired', {
        reason: 'Refresh token expired',
      });
    }
  }
};

/**
 * Cleanup session on app unmount
 */
export const cleanupSession = () => {
  sessionEvents.clear();
};

export default {
  loginUser,
  logoutUser,
  getCurrentSession,
  getActiveSessions,
  revokeSession,
  getSessionAuditLog,
  isAuthenticated,
  getCurrentUserId,
  getCurrentSessionId,
  needsTokenRefresh,
  getTokenTimeRemaining,
  isRefreshTokenExpired,
  onSessionChange,
  initializeSession,
  cleanupSession,
};
