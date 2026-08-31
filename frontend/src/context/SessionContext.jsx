import React, { createContext, useContext, useEffect, useReducer, useCallback, useState, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import * as authService from '../services/authService';
import { TokenStorage, sessionEvents, TabSynchronizer } from '../services/tokenStorage';
import { extractRolesFromAuth0User } from '../utils/roleUtils';
import { apiRequest } from '../services/api';

// Create context
const SessionContext = createContext(null);

/**
 * Session state structure
 */
const initialState = {
  user: null,
  sessionId: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  tokenExpiresIn: null,
  isMobile: false,
  lastActivity: null,
};

/**
 * Session reducer
 */
const sessionReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: action.payload.userId,
          roles: action.payload.roles || [],
        },
        sessionId: action.payload.sessionId,
        tokenExpiresIn: action.payload.expiresIn,
        error: null,
        lastActivity: new Date(),
      };

    case 'LOGIN_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
        isAuthenticated: false,
      };

    case 'LOGOUT_START':
      return {
        ...state,
        isLoading: true,
      };

    case 'LOGOUT_SUCCESS':
      return {
        ...state,
        isAuthenticated: false,
        isLoading: false,
        user: null,
        sessionId: null,
        tokenExpiresIn: null,
        error: null,
      };

    case 'LOGOUT_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
        isAuthenticated: false,
        user: null,
        sessionId: null,
      };

    case 'TOKEN_REFRESHED':
      return {
        ...state,
        tokenExpiresIn: action.payload.expiresIn,
        lastActivity: new Date(),
      };

    case 'SESSION_EXPIRED':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        sessionId: null,
        tokenExpiresIn: null,
        error: 'Session expired',
      };

    case 'RESTORE_SESSION':
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        user: action.payload.user,
        sessionId: action.payload.sessionId,
        error: null,
      };

    case 'RESTORE_FAILED':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: false,
      };

    case 'UPDATE_ACTIVITY':
      return {
        ...state,
        lastActivity: new Date(),
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
};

/**
 * Session Provider Component
 * Wrap your app with this to provide session management
 */
export const SessionProvider = ({ children }) => {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  // Auth0 integration
  const {
    isAuthenticated: isAuth0Authenticated,
    isLoading: isAuth0Loading,
    user: auth0User,
    getAccessTokenSilently,
  } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [auth0Profile, setAuth0Profile] = useState(null);
  const [auth0Roles, setAuth0Roles] = useState([]);
  const [isResolvingAuth0Roles, setIsResolvingAuth0Roles] = useState(false);
  const [hasResolvedAuth0Roles, setHasResolvedAuth0Roles] = useState(false);
  const resolvedSubRef = useRef(null);

  /**
   * Single authoritative profile & role resolution for Auth0 sessions
   */
  useEffect(() => {
    let active = true;

    if (!isAuth0Authenticated || !auth0User) {
      resolvedSubRef.current = null;
      setAuth0Profile(null);
      setAuth0Roles([]);
      setIsResolvingAuth0Roles(false);
      setHasResolvedAuth0Roles(false);
      return;
    }

    const userSub = auth0User?.sub;
    if (!userSub) return;

    // 1. Check if Auth0 user object already has roles in custom claims
    const claimRoles = extractRolesFromAuth0User(auth0User);
    if (claimRoles.length > 0) {
      resolvedSubRef.current = userSub;
      setAuth0Roles(claimRoles);
      setIsResolvingAuth0Roles(false);
      setHasResolvedAuth0Roles(true);
      return;
    }

    // 2. If already resolved for this Auth0 user sub, skip
    if (resolvedSubRef.current === userSub) {
      return;
    }

    resolvedSubRef.current = userSub;
    setIsResolvingAuth0Roles(true);

    const resolveAuth0Profile = async () => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: { audience: auth0Audience },
        });
        const profile = await apiRequest('/profile/me', 'GET', null, token);
        if (!active) return;

        const resolved = Array.isArray(profile?.roles) && profile.roles.length > 0
          ? profile.roles
          : (profile?.role ? [profile.role] : []);

        setAuth0Profile(profile);
        setAuth0Roles(resolved);
      } catch (err) {
        if (active) {
          setAuth0Profile(null);
          setAuth0Roles([]);
        }
      } finally {
        if (active) {
          setIsResolvingAuth0Roles(false);
          setHasResolvedAuth0Roles(true);
        }
      }
    };

    resolveAuth0Profile();

    return () => {
      active = false;
    };
  }, [
    isAuth0Authenticated,
    auth0User?.sub,
    getAccessTokenSilently,
    auth0Audience,
  ]);

  /**
   * Restore session from storage on mount
   */
  useEffect(() => {
    const restoreSession = async () => {
      try {
        if (authService.isAuthenticated()) {
          const userId = TokenStorage.getUserId();
          const sessionId = TokenStorage.getSessionId();

          // Verify session is still valid on server
          try {
            await authService.getCurrentSession();

            dispatch({
              type: 'RESTORE_SESSION',
              payload: {
                user: { id: userId },
                sessionId,
              },
            });
          } catch (error) {
            console.error('Session validation failed:', error);
            TokenStorage.clearTokens();
            dispatch({ type: 'RESTORE_FAILED' });
          }
        } else {
          dispatch({ type: 'RESTORE_FAILED' });
        }
      } catch (error) {
        console.error('Error restoring session:', error);
        dispatch({ type: 'RESTORE_FAILED' });
      }
    };

    restoreSession();

    // Initialize session management
    authService.initializeSession();

    // Cleanup on unmount
    return () => {
      authService.cleanupSession();
    };
  }, []);

  /**
   * Setup event listeners
   */
  useEffect(() => {
    const handleLogin = () => {
      dispatch({ type: 'UPDATE_ACTIVITY' });
    };

    const handleLogout = () => {
      dispatch({ type: 'LOGOUT_SUCCESS' });
    };

    const handleSessionExpired = () => {
      dispatch({ type: 'SESSION_EXPIRED' });
    };

    const handleTokenRefreshed = (payload) => {
      const expiresAt = new Date(payload.expiresAt).getTime();
      const now = Date.now();
      const expiresIn = Math.round((expiresAt - now) / 1000);

      dispatch({
        type: 'TOKEN_REFRESHED',
        payload: { expiresIn },
      });
    };

    const handleUnauthorized = () => {
      dispatch({ type: 'SESSION_EXPIRED' });
    };

    const handleForbidden = (payload) => {
      dispatch({
        type: 'SET_ERROR',
        payload: payload.message || 'Access forbidden',
      });
    };

    // Subscribe to events
    const unsubscribeLogin = sessionEvents.on('login', handleLogin);
    const unsubscribeLogout = sessionEvents.on('logout', handleLogout);
    const unsubscribeExpired = sessionEvents.on('sessionExpired', handleSessionExpired);
    const unsubscribeRefreshed = sessionEvents.on('tokenRefreshed', handleTokenRefreshed);
    const unsubscribeUnauthorized = sessionEvents.on('unauthorized', handleUnauthorized);
    const unsubscribeForbidden = sessionEvents.on('forbidden', handleForbidden);

    return () => {
      unsubscribeLogin();
      unsubscribeLogout();
      unsubscribeExpired();
      unsubscribeRefreshed();
      unsubscribeUnauthorized();
      unsubscribeForbidden();
    };
  }, []);

  /**
   * Login function
   */
  const login = useCallback(async (userId, isMobile = false, deviceName = null) => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const response = await authService.loginUser(userId, isMobile, deviceName);

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          userId,
          sessionId: response.sessionId,
          expiresIn: response.expiresIn,
        },
      });

      return response;
    } catch (error) {
      const errorMessage = error?.detail || error.message || 'Login failed';
      dispatch({
        type: 'LOGIN_ERROR',
        payload: errorMessage,
      });
      throw error;
    }
  }, []);

  /**
   * Logout function
   */
  const logout = useCallback(async (allDevices = false) => {
    dispatch({ type: 'LOGOUT_START' });

    try {
      await authService.logoutUser(allDevices);
      dispatch({ type: 'LOGOUT_SUCCESS' });
    } catch (error) {
      dispatch({
        type: 'LOGOUT_ERROR',
        payload: error?.detail || error.message || 'Logout failed',
      });
      dispatch({ type: 'LOGOUT_SUCCESS' });
    }
  }, []);

  /**
   * Update activity (user interaction)
   */
  const updateActivity = useCallback(() => {
    if (state.isAuthenticated) {
      dispatch({ type: 'UPDATE_ACTIVITY' });
    }
  }, [state.isAuthenticated]);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // Compute unified authentication and RBAC states
  const sessionRoles = Array.isArray(state.user?.roles) ? state.user.roles : [];
  const effectiveRoles = Array.from(new Set([...sessionRoles, ...auth0Roles]));
  const effectiveIsAuthenticated = state.isAuthenticated || isAuth0Authenticated;
  const isResolvingRoles = isAuth0Authenticated && !hasResolvedAuth0Roles;
  const hasResolvedRoles = state.isAuthenticated
    ? true
    : isAuth0Authenticated
    ? hasResolvedAuth0Roles
    : false;
  const effectiveIsLoading = state.isLoading || isAuth0Loading || isResolvingRoles;
  const effectiveUser = state.user || auth0User;

  /**
   * Value object
   */
  const value = {
    // State
    user: effectiveUser,
    profile: auth0Profile,
    sessionId: state.sessionId,
    isAuthenticated: effectiveIsAuthenticated,
    isLoading: effectiveIsLoading,
    isResolvingRoles,
    hasResolvedRoles,
    roles: effectiveRoles,
    effectiveRoles,
    error: state.error,
    tokenExpiresIn: state.tokenExpiresIn,
    lastActivity: state.lastActivity,
    isAuth0Authenticated,
    isAuth0Loading,
    auth0User,

    // Methods
    login,
    logout,
    updateActivity,
    clearError,

    // Utilities
    getCurrentSessionId: () => TokenStorage.getSessionId(),
    getCurrentUserId: () => TokenStorage.getUserId(),
    getAccessToken: () => TokenStorage.getAccessToken(),
    hasTokens: () => TokenStorage.hasTokens(),
    isTokenExpired: () => TokenStorage.isAccessTokenExpired(),
    getTokenTimeRemaining: () => TokenStorage.getAccessTokenTimeRemaining(),
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

/**
 * Hook to use session context
 */
export const useSession = () => {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }

  return context;
};

/**
 * Hook for login
 */
export const useLogin = () => {
  const { login, isLoading, error } = useSession();
  return { login, isLoading, error };
};

/**
 * Hook for logout
 */
export const useLogout = () => {
  const { logout, isLoading } = useSession();
  return { logout, isLoading };
};

/**
 * Hook for checking authentication
 */
export const useIsAuthenticated = () => {
  const { isAuthenticated, isLoading } = useSession();
  return { isAuthenticated, isLoading };
};

/**
 * Hook for current user
 */
export const useCurrentUser = () => {
  const { user, roles, profile, isAuthenticated } = useSession();
  return { user, roles, profile, isAuthenticated };
};

export default SessionContext;
