export const ROLE_CLAIM = 'https://smartproctor.io/roles';

const normalizeRole = (role) => (typeof role === 'string' ? role.trim().toLowerCase() : '');

export const extractRolesFromAuth0User = (auth0User) => {
  if (!auth0User) return [];

  const claimRoles = Array.isArray(auth0User?.[ROLE_CLAIM]) ? auth0User[ROLE_CLAIM] : [];
  const fallbackRoles = Array.isArray(auth0User?.roles) ? auth0User.roles : [];

  const merged = [...claimRoles, ...fallbackRoles]
    .map(normalizeRole)
    .filter(Boolean);

  return Array.from(new Set(merged));
};

export const primaryRole = (roles = []) => {
  const normalized = Array.isArray(roles) ? roles.map(normalizeRole) : [];
  const set = new Set(normalized);

  if (set.has('admin')) return 'admin';
  if (set.has('teacher')) return 'teacher';
  if (set.has('student')) return 'student';

  return null;
};

export const dashboardForRoles = (roles = []) => {
  const role = primaryRole(roles);

  if (role === 'admin') return '/admin-panel';
  if (role === 'teacher') return '/teacher-dashboard';
  if (role === 'student') return '/student-dashboard';

  return '/login';
};

export const hasAnyRequiredRole = (userRoles = [], requiredRoles = []) => {
  const normalizedUserRoles = new Set(
    (Array.isArray(userRoles) ? userRoles : []).map(normalizeRole).filter(Boolean)
  );
  const normalizedRequiredRoles = (Array.isArray(requiredRoles) ? requiredRoles : [])
    .map(normalizeRole)
    .filter(Boolean);

  if (normalizedRequiredRoles.length === 0) return true;

  return normalizedRequiredRoles.some((role) => normalizedUserRoles.has(role));
};
