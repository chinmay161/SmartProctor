import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import './index.css'
import App from './App.jsx'
import './styles/tailwind.css';
import { initFrontendSentry } from './utils/sentryScrubber'
import { isNativeApp, getNativeCallbackUrl } from './utils/platform'

initFrontendSentry();

if (import.meta.env.DEV) {
  window.__triggerSentryTestError = () => {
    throw new Error('Deliberate test error for Sentry frontend verification');
  };
}

const isNative = isNativeApp();
const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN;
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
const auth0ClientId = isNative
  ? (import.meta.env.VITE_AUTH0_NATIVE_CLIENT_ID || import.meta.env.VITE_AUTH0_CLIENT_ID)
  : import.meta.env.VITE_AUTH0_CLIENT_ID;

const redirectUri = isNative
  ? getNativeCallbackUrl(auth0Domain)
  : window.location.origin;

const scope = isNative
  ? 'openid profile email offline_access'
  : 'openid profile email';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      useRefreshTokens={isNative ? true : undefined}
      useRefreshTokensFallback={isNative ? false : undefined}
      cacheLocation={isNative ? 'localstorage' : undefined}
      skipRedirectCallback={isNative}
      onRedirectCallback={(appState) => {
        const target = appState?.returnTo;
        if (typeof target === 'string' && target.length > 0) {
          window.history.replaceState({}, document.title, target);
        }
      }}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience: auth0Audience,
        scope: scope,
      }}
    >
      <App />
    </Auth0Provider>
  </StrictMode>,
)
