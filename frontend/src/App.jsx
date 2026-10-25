import React, { useEffect } from 'react';
import Routes from './Routes';
import { ThemeProvider } from './context/ThemeContext';
import { SessionProvider } from './context/SessionContext';
import { ToastProvider } from './context/ToastContext';

function App() {
  useEffect(() => {
    // Initialize app
    console.log('SmartProctor App initialized');
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

export default App;
