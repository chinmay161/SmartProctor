import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { App as CapacitorApp } from '@capacitor/app';
import { isNativeApp, processAppUrl } from '../../utils/platform';

/**
 * Handles incoming deep link URLs via Capacitor's 'appUrlOpen' event.
 * If the URL contains state and (code or error), calls handleRedirectCallback(url),
 * closes the in-app browser, and navigates to appState.returnTo (or role home).
 */
export function NativeAuthHandler() {
  const navigate = useNavigate();
  const { handleRedirectCallback } = useAuth0();

  useEffect(() => {
    if (!isNativeApp()) return;

    let sub = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        sub = await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
          if (!isMounted) return;
          await processAppUrl(url, {
            handleRedirectCallback,
            navigate: (to, opts) => {
              if (isMounted) navigate(to, opts);
            },
          });
        });
      } catch (err) {
        console.error('[NativeAuthHandler] Failed to register appUrlOpen listener:', err);
      }
    };

    void setupListener();

    return () => {
      isMounted = false;
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
    };
  }, [handleRedirectCallback, navigate]);

  return null;
}

export default NativeAuthHandler;
