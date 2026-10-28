/**
 * Format a student's display name cleanly without leaking raw OAuth provider strings
 * like 'google-oauth2|111098044937374607894'.
 *
 * Priority:
 * 1. Clean human name (e.g. 'Krutika Jumare')
 * 2. Formatted name from student email (e.g. '2025.krutika.jumare@ves.ac.in' -> 'Krutika Jumare')
 * 3. Clean OAuth provider label + short identifier (e.g. 'Google Student (7894)')
 */
export function formatStudentName(sessionOrStudent, fallback = 'Student') {
  if (!sessionOrStudent) return fallback;

  let name = null;
  let email = null;
  let id = null;

  if (typeof sessionOrStudent === 'object') {
    name = sessionOrStudent.student_name || sessionOrStudent.name || null;
    email = sessionOrStudent.student_email || sessionOrStudent.email || null;
    id = sessionOrStudent.student_id || sessionOrStudent.id || null;
  } else if (typeof sessionOrStudent === 'string') {
    id = sessionOrStudent;
  }

  // 1. If explicit clean name is available and not an oauth identifier
  if (name && typeof name === 'string') {
    const isOauthLike = name.includes('|') || name.startsWith('google-') || name.startsWith('auth0|');
    if (!isOauthLike) {
      return name;
    }
  }

  // 2. Format from email if available
  if (email && typeof email === 'string' && email.includes('@')) {
    const userPart = email.split('@')[0];
    // Strip common academic roll prefixes like '2025.'
    const cleaned = userPart.replace(/^\d{4}\./, '').replace(/\./g, ' ');
    const words = cleaned.split(/[\s_-]+/).filter(Boolean);
    if (words.length > 0) {
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    return email;
  }

  // 3. Format raw OAuth strings like google-oauth2|111098044937374607894
  if (id && typeof id === 'string') {
    if (id.includes('|')) {
      const [provider, raw] = id.split('|');
      const provName = provider.includes('google')
        ? 'Google'
        : provider.includes('github')
        ? 'GitHub'
        : 'Student';
      const short = raw.length > 4 ? raw.slice(-4) : raw;
      return `${provName} Student (${short})`;
    }
    return id;
  }

  return fallback;
}
