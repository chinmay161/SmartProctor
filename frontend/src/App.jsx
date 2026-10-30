import React, { useEffect, useState } from 'react';
import Routes from './Routes';
import { ThemeProvider } from "./context/ThemeContext";
import { SessionProvider } from "./context/SessionContext";
import { ToastProvider } from "./context/ToastContext";
import UpdateModal from './components/update/UpdateModal';
import AppUpdate from './plugins/appUpdate';
import { isNativeApp } from './utils/platform';

function App() {
  const [backgroundRelease, setBackgroundRelease] = useState(null);

  useEffect(() => {
    // On web preview/client, check for updates asynchronously after launch if not already deferred
    const isDeferred = sessionStorage.getItem('smartproctor_update_deferred') === 'true';
    if (!isDeferred && !isNativeApp()) {
      const timer = setTimeout(() => {
        AppUpdate.checkForUpdate({ manual: false })
          .then((res) => {
            if (res?.available) {
              setBackgroundRelease(res);
            }
          })
          .catch(() => {
            // Silently ignore background check failures on web launch
          });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          <Routes />
          <UpdateModal
            isOpen={Boolean(backgroundRelease)}
            release={backgroundRelease}
            onClose={() => setBackgroundRelease(null)}
          />
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

export default App;
