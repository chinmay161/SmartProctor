import { useSession } from '../context/SessionContext';

/**
 * Hook to consume unified authentication and RBAC resolution state
 * backed authoritatively by SessionContext.
 */
export const useAuthRoles = () => {
  const session = useSession();

  return {
    effectiveIsAuthenticated: session.isAuthenticated,
    effectiveIsLoading: session.isLoading,
    effectiveRoles: session.roles,
    hasResolvedRoles: session.hasResolvedRoles,
    isResolvingRoles: session.isResolvingRoles,
    user: session.user,
    profile: session.profile,
  };
};

export default useAuthRoles;
