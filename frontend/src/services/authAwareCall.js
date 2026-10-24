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

  const requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `req-${Math.random().toString(36).slice(2, 11)}`;

  let auth0Token = null;
  if (auth0Authenticated && typeof getAccessTokenSilently === 'function') {
    try {
      auth0Token = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Audience,
        },
      });
    } catch {
      auth0Token = null;
    }
  }


  let lastError = null;
  for (let i = 0; i < pathsToTry.length; i += 1) {
    const candidatePath = pathsToTry[i];
    const headers = {
      'X-Request-ID': requestId,
      ...(auth0Token ? { Authorization: `Bearer ${auth0Token}` } : {}),
    };
    const config = { headers };

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

  if (lastError) {
    if (typeof lastError === 'string') {
      if (!lastError.includes('request id:')) {
        lastError = `${lastError} (request id: ${requestId})`;
      }
    } else if (typeof lastError === 'object' && lastError !== null) {
      lastError.requestId = lastError.requestId || requestId;
      if (typeof lastError.detail === 'string' && !lastError.detail.includes('request id:')) {
        lastError.detail = `${lastError.detail} (request id: ${requestId})`;
      }
      if (typeof lastError.message === 'string' && !lastError.message.includes('request id:')) {
        lastError.message = `${lastError.message} (request id: ${requestId})`;
      }
    }
  }

  throw lastError;
};

export default authAwareCall;

