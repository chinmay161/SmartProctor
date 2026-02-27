import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'system',
  setTheme: () => {},
  resolvedTheme: 'dark'
});

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const getSystemTheme = () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  }
  return 'dark';
};

const getStoredTheme = () => {
  try {
    const stored = localStorage.getItem('smartproctor-theme');
    if (stored && ['light', 'dark', 'system']?.includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.error('Failed to read theme from localStorage:', error);
  }
  return 'system';
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState(getSystemTheme);

  useEffect(() => {
    const root = document.documentElement;
    const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
    
    setResolvedTheme(effectiveTheme);
    
    if (effectiveTheme === 'dark') {
      root.classList?.add('dark');
    } else {
      root.classList?.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const newTheme = e?.matches ? 'dark' : 'light';
      setResolvedTheme(newTheme);
      const root = document.documentElement;
      if (newTheme === 'dark') {
        root.classList?.add('dark');
      } else {
        root.classList?.remove('dark');
      }
    };

    if (mediaQuery?.addEventListener) {
      mediaQuery?.addEventListener('change', handleChange);
      return () => mediaQuery?.removeEventListener('change', handleChange);
    } else {
      mediaQuery?.addListener(handleChange);
      return () => mediaQuery?.removeListener(handleChange);
    }
  }, [theme]);

  const setTheme = (newTheme) => {
    try {
      localStorage.setItem('smartproctor-theme', newTheme);
      setThemeState(newTheme);
    } catch (error) {
      console.error('Failed to save theme to localStorage:', error);
      setThemeState(newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;