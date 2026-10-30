import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthRoles } from '../../utils/useAuthRoles';
import { dashboardForRoles } from '../../utils/roleUtils';

/**
 * Handles post-login web redirection:
 * When a user completes Auth0 authentication, redirects them to their role-appropriate
 * dashboard instead of leaving them on the landing page/homepage.
 */
export function AuthRedirectHandler() {
  const navigate = useNavigate();
  const { effectiveIsAuthenticated, effectiveRoles, hasResolvedRoles } = useAuthRoles();

  useEffect(() => {
    const search = window.location.search || '';
    const hasAuthParams = search.includes('code=') && search.includes('state=');
    const wasLoggingIn = sessionStorage.getItem('auth_redirect_to_dashboard') === 'true';

    if (hasAuthParams || wasLoggingIn) {
      if (effectiveIsAuthenticated) {
        sessionStorage.removeItem('auth_redirect_to_dashboard');
        const rolePath = dashboardForRoles(effectiveRoles);
        if (rolePath && rolePath !== '/login') {
          navigate(rolePath, { replace: true });
        } else if (hasResolvedRoles) {
          navigate('/student-dashboard', { replace: true });
        }
      }
    }
  }, [effectiveIsAuthenticated, effectiveRoles, hasResolvedRoles, navigate]);

  return null;
}

export default AuthRedirectHandler;
