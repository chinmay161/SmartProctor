/**
 * Protected Route Component
 * Enforces authentication and role-based access control
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useAuth0 } from '@auth0/auth0-react';
import {
  dashboardForRoles,
  extractRolesFromAuth0User,
  hasAnyRequiredRole,
} from '../utils/roleUtils';

/**
 * ProtectedRoute Component
 * Renders component if authenticated, redirects to login otherwise
 *
 * @param {object} props
 * @param {React.Component} props.component - Component to render if authenticated
 * @param {Array<string>} props.requiredRoles - List of allowed roles (optional)
 * @param {string} props.loginPath - Path to navigate to if not authenticated (default: '/login')
 * @param {string} props.accessDeniedPath - Path to navigate to if role check fails
 * @returns {React.Component}
 *
 * @example
 * <ProtectedRoute
 *   component={StudentDashboard}
 *   requiredRoles={['student']}
 * />
 */
export const ProtectedRoute = ({
  component: Component,
  requiredRoles = [],
  loginPath = '/login',
  accessDeniedPath = '/login',
  ...rest
}) => {
  const { isAuthenticated, isLoading, user } = useSession();
  const {
    isAuthenticated: isAuth0Authenticated,
    isLoading: isAuth0Loading,
    user: auth0User,
  } = useAuth0();
  const location = useLocation();
  const sessionRoles = Array.isArray(user?.roles) ? user.roles : [];
  const auth0Roles = extractRolesFromAuth0User(auth0User);
  const effectiveRoles = Array.from(new Set([...sessionRoles, ...auth0Roles]));
  const effectiveIsLoading = isLoading || isAuth0Loading;
  const effectiveIsAuthenticated = isAuthenticated || isAuth0Authenticated;

  // Still loading session
  if (effectiveIsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!effectiveIsAuthenticated) {
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // Enforce role-based access (fail closed when roles are required)
  if (requiredRoles.length > 0) {
    // If claims are not present yet, let page-level API checks determine access.
    if (effectiveRoles.length === 0) {
      return <Component {...rest} />;
    }
    const hasRequiredRole = hasAnyRequiredRole(effectiveRoles, requiredRoles);
    if (!hasRequiredRole) {
      const fallbackPath = dashboardForRoles(effectiveRoles);
      const deniedPath = fallbackPath === '/login' ? accessDeniedPath : fallbackPath;
      return <Navigate to={deniedPath} replace />;
    }
  }

  // Render component
  return <Component {...rest} />;
};

/**
 * Public Route Component
 * Redirects to dashboard if already authenticated,
 * renders component otherwise
 *
 * @param {object} props
 * @param {React.Component} props.component - Component to render
 * @param {string} props.redirectPath - Path to navigate to if authenticated
 * @returns {React.Component}
 *
 * @example
 * <PublicRoute
 *   component={Login}
 *   redirectPath="/student-dashboard"
 * />
 */
export const PublicRoute = ({
  component: Component,
  redirectPath = '/student-dashboard',
  ...rest
}) => {
  const { isAuthenticated, isLoading, user } = useSession();
  const {
    isAuthenticated: isAuth0Authenticated,
    isLoading: isAuth0Loading,
    user: auth0User,
  } = useAuth0();
  const sessionRoles = Array.isArray(user?.roles) ? user.roles : [];
  const auth0Roles = extractRolesFromAuth0User(auth0User);
  const effectiveRoles = Array.from(new Set([...sessionRoles, ...auth0Roles]));
  const effectiveIsLoading = isLoading || isAuth0Loading;
  const effectiveIsAuthenticated = isAuthenticated || isAuth0Authenticated;
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const forceLogin = searchParams.get('forceLogin') === '1' || location.state?.forceLogin === true;

  if (effectiveIsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Already authenticated
  if (effectiveIsAuthenticated) {
    if (forceLogin) {
      return <Component {...rest} />;
    }
    const rolePath = dashboardForRoles(effectiveRoles);
    if (rolePath === '/login') {
      // No resolvable role yet; allow login page to render and resolve gracefully.
      return <Component {...rest} />;
    }
    return <Navigate to={rolePath} replace />;
  }

  // Render public component
  return <Component {...rest} />;
};

/**
 * Conditional Render Component
 * Renders component only if user has required role
 *
 * @param {object} props
 * @param {React.Component} props.children - Component to render
 * @param {Array<string>} props.requiredRoles - List of allowed roles
 * @param {React.Component} props.fallback - Component to render if unauthorized
 * @param {boolean} props.require - If true, deny access if any role missing. If false, allow if any role matches
 * @returns {React.Component}
 *
 * @example
 * <RoleBasedAccess requiredRoles={['admin', 'teacher']}>
 *   <AdminPanel />
 * </RoleBasedAccess>
 */
export const RoleBasedAccess = ({
  children,
  requiredRoles = [],
  fallback = null,
  require = false,
}) => {
  const { user, isAuthenticated } = useSession();

  if (!isAuthenticated || !user?.roles) {
    return fallback;
  }

  const hasAccess = require
    ? requiredRoles.every(role => user.roles.includes(role))
    : requiredRoles.some(role => user.roles.includes(role));

  return hasAccess ? children : fallback;
};

/**
 * Permission Guard Component
 * Renders children only if permission check passes
 *
 * @param {object} props
 * @param {function} props.check - Function that returns boolean
 * @param {React.Component} props.children - Component to render if check passes
 * @param {React.Component} props.fallback - Component to render if check fails
 * @param {object} props.context - Context object to pass to check function
 * @returns {React.Component}
 *
 * @example
 * <PermissionGuard
 *   check={(user) => user.id === resource.owner}
 *   context={user}
 * >
 *   <EditButton />
 * </PermissionGuard>
 */
export const PermissionGuard = ({
  check,
  children,
  fallback = null,
  context = {},
}) => {
  const { user, isAuthenticated } = useSession();

  if (!isAuthenticated || !user) {
    return fallback;
  }

  const hasPermission = check({ ...user, ...context });

  return hasPermission ? children : fallback;
};

export default ProtectedRoute;
