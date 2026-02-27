/**
 * Token Storage Utilities
 * Securely manages session tokens with multiple storage strategies
 */

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'smartproctor_access_token',
  REFRESH_TOKEN: 'smartproctor_refresh_token',
  SESSION_ID: 'smartproctor_session_id',
  TOKEN_EXPIRES_AT: 'smartproctor_token_expires_at',
  REFRESH_EXPIRES_AT: 'smartproctor_refresh_expires_at',
  USER_ID: 'smartproctor_user_id',
};

/**
 * Token Storage Manager
 * Handles secure storage and retrieval of session tokens
 * 
 * Strategy:
 * - Access token: sessionStorage (cleared on tab close) for security
 * - Refresh token: localStorage (persistent) with sessionStorage fallback
 * - Session metadata: sessionStorage
 */
export class TokenStorage {
  /**
   * Save tokens to storage
   * Access token in sessionStorage (secure, cleared on tab close)
   * Refresh token in localStorage (persistent across sessions)
   */
  static saveTokens(accessToken, refreshToken, sessionData) {
    try {
      // Clear old tokens first
      this.clearTokens();

      // Store access token in sessionStorage (cleared on tab close)
      if (accessToken) {
        sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      }

      // Store refresh token in localStorage (persists across sessions)
      if (refreshToken) {
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      }

      // Store session metadata in sessionStorage
      if (sessionData) {
        sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionData.session_id);
        sessionStorage.setItem(STORAGE_KEYS.USER_ID, sessionData.user_id || '');
      }

      // Store expiration times
      if (sessionData?.access_token_expires_at) {
        sessionStorage.setItem(
          STORAGE_KEYS.TOKEN_EXPIRES_AT,
          sessionData.access_token_expires_at
        );
      }

      if (sessionData?.refresh_token_expires_at) {
        localStorage.setItem(
          STORAGE_KEYS.REFRESH_EXPIRES_AT,
          sessionData.refresh_token_expires_at
        );
      }

      return true;
    } catch (error) {
      console.error('Error saving tokens:', error);
      return false;
    }
  }

  /**
   * Get access token from storage
   */
  static getAccessToken() {
    try {
      return sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    } catch (error) {
      console.error('Error retrieving access token:', error);
      return null;
    }
  }

  /**
   * Get refresh token from storage
   */
  static getRefreshToken() {
    try {
      // Try sessionStorage first, then localStorage
      let token = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!token) {
        token = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      }
      return token;
    } catch (error) {
      console.error('Error retrieving refresh token:', error);
      return null;
    }
  }

  /**
   * Get session ID
   */
  static getSessionId() {
    try {
      return sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
    } catch (error) {
      console.error('Error retrieving session ID:', error);
      return null;
    }
  }

  /**
   * Get user ID
   */
  static getUserId() {
    try {
      return sessionStorage.getItem(STORAGE_KEYS.USER_ID);
    } catch (error) {
      console.error('Error retrieving user ID:', error);
      return null;
    }
  }

  /**
   * Get all stored session data
   */
  static getSessionData() {
    return {
      accessToken: this.getAccessToken(),
      refreshToken: this.getRefreshToken(),
      sessionId: this.getSessionId(),
      userId: this.getUserId(),
      tokenExpiresAt: sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT),
      refreshExpiresAt: localStorage.getItem(STORAGE_KEYS.REFRESH_EXPIRES_AT),
    };
  }

  /**
   * Check if tokens exist
   */
  static hasTokens() {
    return !!(this.getAccessToken() && this.getRefreshToken());
  }

  /**
   * Check if access token is expired or about to expire
   * @param bufferSeconds - buffer time before expiration (default 60 seconds)
   */
  static isAccessTokenExpired(bufferSeconds = 60) {
    try {
      const expiresAtStr = sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
      if (!expiresAtStr) {
        return true; // No expiry info = expired
      }

      const expiresAt = new Date(expiresAtStr).getTime();
      const now = Date.now() + (bufferSeconds * 1000);

      return now >= expiresAt;
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true;
    }
  }

  /**
   * Check if refresh token is expired
   */
  static isRefreshTokenExpired() {
    try {
      const expiresAtStr = localStorage.getItem(STORAGE_KEYS.REFRESH_EXPIRES_AT);
      if (!expiresAtStr) {
        return true;
      }

      const expiresAt = new Date(expiresAtStr).getTime();
      const now = Date.now();

      return now >= expiresAt;
    } catch (error) {
      console.error('Error checking refresh token expiration:', error);
      return true;
    }
  }

  /**
   * Get time remaining for access token (in seconds)
   */
  static getAccessTokenTimeRemaining() {
    try {
      const expiresAtStr = sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
      if (!expiresAtStr) {
        return 0;
      }

      const expiresAt = new Date(expiresAtStr).getTime();
      const now = Date.now();
      const remaining = Math.max(0, (expiresAt - now) / 1000);

      return remaining;
    } catch (error) {
      console.error('Error getting token time remaining:', error);
      return 0;
    }
  }

  /**
   * Clear all tokens from storage
   */
  static clearTokens() {
    try {
      // Clear sessionStorage
      sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_ID);
      sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
      sessionStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
      sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);

      // Clear localStorage
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_EXPIRES_AT);

      return true;
    } catch (error) {
      console.error('Error clearing tokens:', error);
      return false;
    }
  }

  /**
   * Export session for recovery (e.g., cross-tab communication)
   */
  static exportSession() {
    return {
      accessToken: this.getAccessToken(),
      refreshToken: this.getRefreshToken(),
      sessionId: this.getSessionId(),
      userId: this.getUserId(),
    };
  }

  /**
   * Import session (e.g., from other tab)
   */
  static importSession(sessionData) {
    if (sessionData?.accessToken && sessionData?.refreshToken) {
      this.saveTokens(
        sessionData.accessToken,
        sessionData.refreshToken,
        {
          session_id: sessionData.sessionId,
          user_id: sessionData.userId,
        }
      );
      return true;
    }
    return false;
  }
}

/**
 * Session Events
 * Allows components to listen to session changes
 */
class SessionEventEmitter {
  constructor() {
    this.listeners = {};
  }

  /**
   * Subscribe to session events
   * @param {string} event - Event name (login, logout, refresh, expired)
   * @param {function} callback - Callback function
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Return unsubscribe function
    return () => {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
    };
  }

  /**
   * Emit an event
   */
  emit(event, data) {
    if (!this.listeners[event]) {
      return;
    }
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in session event listener for ${event}:`, error);
      }
    });
  }

  /**
   * Remove all listeners for an event
   */
  off(event) {
    delete this.listeners[event];
  }

  /**
   * Clear all listeners
   */
  clear() {
    this.listeners = {};
  }
}

export const sessionEvents = new SessionEventEmitter();

/**
 * Tab synchronization for cross-tab login/logout
 */
export class TabSynchronizer {
  static init() {
    // Listen for storage changes from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.ACCESS_TOKEN) {
        const newToken = e.newValue;
        const oldToken = e.oldValue;

        if (newToken && !oldToken) {
          // Another tab logged in
          sessionEvents.emit('login', { source: 'external' });
        } else if (!newToken && oldToken) {
          // Another tab logged out
          sessionEvents.emit('logout', { source: 'external' });
        }
      }
    });
  }

  /**
   * Broadcast login to other tabs
   */
  static broadcastLogin() {
    try {
      sessionStorage.setItem(`smartproctor_login_event_${Date.now()}`, 'true');
    } catch (error) {
      console.error('Error broadcasting login:', error);
    }
  }

  /**
   * Broadcast logout to other tabs
   */
  static broadcastLogout() {
    try {
      sessionStorage.setItem(`smartproctor_logout_event_${Date.now()}`, 'true');
    } catch (error) {
      console.error('Error broadcasting logout:', error);
    }
  }
}

export default TokenStorage;
