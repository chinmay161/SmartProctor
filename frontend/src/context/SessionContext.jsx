import React, { createContext, useContext, useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { extractRolesFromAuth0User } from '../utils/roleUtils';
import { apiRequest } from '../services/api';
import { setAccessTokenProvider, setLoginRedirectHandler } from '../services/httpClient';
import { setSentryRole } from '../utils/sentryScrubber';
import { isNativeApp, openUrl, getNativeCallbackUrl } from '../utils/platform';
import { releaseNativeLockdown } from '../proctoring/nativeLockdown';

// Keys written by the removed custom-session token storage. Exact names only:
// other code (e.g. ThemeContext's 'smartproctor-theme') shares the prefix.
const LEGACY_SESSION_KEYS = [
  'smartproctor_access_token',
  'smartproctor_refresh_token',
  'smartproctor_session_id',
  'smartproctor_token_expires_at',
  'smartproctor_refresh_expires_at',
  'smartproctor_user_id',
];

let legacyKeysCleared = false;

const clearLegacySessionKeys = () => {
  if (legacyKeysCleared) return;
  legacyKeysCleared = true;
  try {
    LEGACY_SESSION_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch {
    // Storage may be unavailable (private mode); nothing to clean up then.
  }
};

const SessionContext = createContext(null);

/**
 * Session Provider Component
 * Thin layer over Auth0: resolves roles/profile and wires httpClient to Auth0 tokens.
 * Must be rendered inside Auth0Provider.
 */
export const SessionProvider = ({ children }) => {
  const {
    isAuthenticated,
    isLoading: isAuth0Loading,
    user,
    getAccessTokenSilently,
    loginWithRedirect,
    logout: auth0Logout,
  } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN;

  const [profile, setProfile] = useState(null);
  const [roles, setRoles] = useState([]);
  const [hasResolvedRoles, setHasResolvedRoles] = useState(false);
  const resolvedSubRef = useRef(null);

  useEffect(() => {
    clearLegacySessionKeys();
  }, []);

  /**
   * Register Auth0 token access for httpClient. Layout effect so it is in place
   * before children's mount effects fire their first requests.
   */
  useLayoutEffect(() => {
    setAccessTokenProvider((options = {}) =>
      getAccessTokenSilently({
        ...options,
        authorizationParams: { audience: auth0Audience, ...options.authorizationParams },
      })
    );
    setLoginRedirectHandler((options = {}) =>
      loginWithRedirect({
        ...(isNativeApp() ? { openUrl } : {}),
        ...options,
        authorizationParams: { audience: auth0Audience, ...options.authorizationParams },
      })
    );
  }, [getAccessTokenSilently, loginWithRedirect, auth0Audience]);

  /**
   * Single authoritative profile & role resolution for Auth0 sessions
   */
  useEffect(() => {
    let active = true;

    if (!isAuthenticated || !user) {
      resolvedSubRef.current = null;
      setProfile(null);
      setRoles([]);
      setHasResolvedRoles(false);
      return;
    }

    const userSub = user?.sub;
    if (!userSub) return;

    // 1. Check if Auth0 user object already has roles in custom claims
    const claimRoles = extractRolesFromAuth0User(user);
    if (claimRoles.length > 0) {
      resolvedSubRef.current = userSub;
      setRoles(claimRoles);
      setSentryRole(claimRoles[0]);
      setHasResolvedRoles(true);
      return;
    }

    // 2. If already resolved for this Auth0 user sub, skip
    if (resolvedSubRef.current === userSub) {
      return;
    }

    resolvedSubRef.current = userSub;

    const resolveProfile = async () => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: { audience: auth0Audience },
        });
        const remoteProfile = await apiRequest('/profile/me', 'GET', null, token);
        if (!active) return;

        const resolved = Array.isArray(remoteProfile?.roles) && remoteProfile.roles.length > 0
          ? remoteProfile.roles
          : (remoteProfile?.role ? [remoteProfile.role] : []);

        setProfile(remoteProfile);
        setRoles(resolved);
        setSentryRole(resolved[0] || remoteProfile?.role || 'student');
      } catch {
        if (active) {
          setProfile(null);
          setRoles([]);
        }
      } finally {
        if (active) {
          setHasResolvedRoles(true);
        }
      }
    };

    resolveProfile();

    return () => {
      active = false;
    };
  }, [
    isAuthenticated,
    user?.sub,
    getAccessTokenSilently,
    auth0Audience,
  ]);

  const logout = useCallback(() => {
    if (isNativeApp()) {
      void releaseNativeLockdown();
      const nativeReturnTo = getNativeCallbackUrl(auth0Domain);
      auth0Logout({
        openUrl,
        logoutParams: { returnTo: nativeReturnTo },
      });
    } else {
      auth0Logout({ logoutParams: { returnTo: window.location.origin } });
    }
  }, [auth0Logout, auth0Domain]);

  const isResolvingRoles = isAuthenticated && !hasResolvedRoles;

  const value = {
    user,
    profile,
    isAuthenticated,
    isLoading: isAuth0Loading || isResolvingRoles,
    isResolvingRoles,
    hasResolvedRoles: isAuthenticated ? hasResolvedRoles : false,
    roles,
    logout,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

/* eslint-disable react-refresh/only-export-components */
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
 * Hook for logout
 */
export const useLogout = () => {
  const { logout } = useSession();
  return { logout };
};

/**
 * Hook for current user
 */
export const useCurrentUser = () => {
  const { user, roles, profile, isAuthenticated } = useSession();
  return { user, roles, profile, isAuthenticated };
};

export default SessionContext;
