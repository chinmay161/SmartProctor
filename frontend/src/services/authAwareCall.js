import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './httpClient';

const normalizeMethod = (method = 'GET') => String(method || 'GET').toUpperCase();

const isNetworkLikeError = (error) => {
  if (!error) return false;
  if (typeof error === 'string') {
    const normalized = error.toLowerCase();
    return normalized.includes('network error') || normalized.includes('failed to fetch');
  }
  const message = String(error?.message || '').toLowerCase();
  return message.includes('network error') || message.includes('failed to fetch');
};

const callHttpClient = (method, path, body, config) => {
  const verb = normalizeMethod(method);
  if (verb === 'GET') return apiGet(path, config);
  if (verb === 'POST') return apiPost(path, body, config);
  if (verb === 'PUT') return apiPut(path, body, config);
  if (verb === 'DELETE') return apiDelete(path, config);
  if (verb === 'PATCH') return apiPatch(path, body, config);
  return apiPost(path, body, { ...config, method: verb });
};

export const authAwareCall = async ({
  path,
  method = 'GET',
  body = null,
  auth0Authenticated = false,
  getAccessTokenSilently = null,
  auth0Audience = null,
  fallbackPaths = [],
}) => {
  const pathsToTry = [path, ...(Array.isArray(fallbackPaths) ? fallbackPaths : [])];

  let auth0Token = null;
  if (auth0Authenticated && typeof getAccessTokenSilently === 'function') {
    try {
      auth0Token = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Audience,
        },
      });
    } catch (error) {
      auth0Token = null;
    }
  }

  let lastError = null;
  for (let i = 0; i < pathsToTry.length; i += 1) {
    const candidatePath = pathsToTry[i];
    const config = auth0Token
      ? { headers: { Authorization: `Bearer ${auth0Token}` } }
      : {};

    try {
      return await callHttpClient(method, candidatePath, body, config);
    } catch (error) {
      lastError = error;
      const hasMoreCandidates = i < pathsToTry.length - 1;
      if (!hasMoreCandidates) break;

      // Only fail over to alternate paths for likely transport/route problems.
      const detail = String(error?.detail || '').trim().toLowerCase();
      const shouldTryNext = isNetworkLikeError(error) || detail === 'not found';
      if (!shouldTryNext) break;
    }
  }

  throw lastError;
};

export default authAwareCall;
