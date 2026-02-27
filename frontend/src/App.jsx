import React, { useEffect } from 'react';
import Routes from './Routes';
import { ThemeProvider } from "./context/ThemeContext";
import { SessionProvider } from "./context/SessionContext";

function App() {
  useEffect(() => {
    // Initialize app
    console.log('SmartProctor App initialized');
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider>
        <Routes />
      </ThemeProvider>
    </SessionProvider>
  );
}

export default App;
