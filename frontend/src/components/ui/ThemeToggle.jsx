import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import Icon from '../AppIcon';

/**
 * Modern dark/light mode toggle pill with Lucide icons and Tailwind styling.
 * Supports floating mode (fixed top-right) or embedded inline in navigation bars.
 */
const ThemeToggle = ({ floating = true }) => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      id="theme-toggle-btn"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={`
        ${floating ? 'fixed top-3.5 right-3.5 z-[999]' : 'relative'}
        inline-flex items-center justify-center gap-2 px-3 py-1.5
        rounded-full border border-border bg-card/90 text-muted-foreground
        hover:text-foreground hover:border-primary/50 hover:bg-card
        backdrop-blur-md shadow-sm hover:shadow transition-all duration-200
        text-xs font-medium cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-primary/40
      `}
    >
      <Icon
        name={isDark ? 'Moon' : 'Sun'}
        size={14}
        className={isDark ? 'text-blue-400' : 'text-amber-500'}
      />
      <span>{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
};

export default ThemeToggle;
