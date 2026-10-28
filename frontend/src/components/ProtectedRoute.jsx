/* eslint-disable no-unused-vars */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { DashboardSkeleton, AuthTransitionSkeleton } from './ui/Skeleton';
import { useAuthRoles } from '../utils/useAuthRoles';
import {
  dashboardForRoles,
  hasAnyRequiredRole,
} from '../utils/roleUtils';
import { isNativeApp } from '../utils/platform';

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
  const {
    effectiveIsAuthenticated,
    effectiveIsLoading,
    effectiveRoles,
    hasResolvedRoles,
  } = useAuthRoles();
  const location = useLocation();

  // Still loading session or resolving roles
  if (effectiveIsLoading) {
    return <DashboardSkeleton />;
  }

  // Not authenticated
  if (!effectiveIsAuthenticated) {
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // Native guard: If user's role is teacher/admin or route requires teacher/admin,
  // redirect every teacher/admin route to the full-screen "Use the web version" page.
  if (isNativeApp()) {
    const isTeacherOrAdminUser = effectiveRoles.some((r) => r === 'teacher' || r === 'admin');
    const isTeacherOrAdminRoute = requiredRoles.some((r) => r === 'teacher' || r === 'admin');
    if (isTeacherOrAdminUser || isTeacherOrAdminRoute) {
      return <Navigate to="/use-web-version" replace />;
    }
  }

  // Enforce role-based access
  if (requiredRoles.length > 0) {
    const hasRequiredRole = hasAnyRequiredRole(effectiveRoles, requiredRoles);
    if (!hasRequiredRole) {
      if (hasResolvedRoles) {
        const fallbackPath = dashboardForRoles(effectiveRoles);
        const deniedPath = fallbackPath === '/login' ? accessDeniedPath : fallbackPath;
        return <Navigate to={deniedPath} replace />;
      }
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
  const {
    effectiveIsAuthenticated,
    effectiveIsLoading,
    effectiveRoles,
    hasResolvedRoles,
  } = useAuthRoles();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const forceLogin = searchParams.get('forceLogin') === '1' || location.state?.forceLogin === true;

  if (effectiveIsLoading) {
    return <AuthTransitionSkeleton message="Loading your workspace..." />;
  }

  // Already authenticated
  if (effectiveIsAuthenticated) {
    if (forceLogin) {
      return <Component {...rest} />;
    }
    if (isNativeApp() && effectiveRoles.some((r) => r === 'teacher' || r === 'admin')) {
      return <Navigate to="/use-web-version" replace />;
    }
    const rolePath = dashboardForRoles(effectiveRoles);
    if (rolePath === '/login') {
      if (!hasResolvedRoles) {
        return <AuthTransitionSkeleton message="Resolving permissions..." />;
      }
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
