import React from 'react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Floating dark/light mode toggle pill.
 * Uses global --sp-* design tokens so it works on any page in the app.
 * Persists preference via ThemeContext -> localStorage.
 */
const ThemeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      id="theme-toggle-btn"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{
        position: 'fixed',
        top: '14px',
        right: '14px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        padding: '7px 14px',
        borderRadius: '999px',
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-muted-foreground)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.78rem',
        fontWeight: 500,
        cursor: 'pointer',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: 'var(--shadow-md)',
        transition: 'border-color 0.2s, box-shadow 0.2s, color 0.2s, background 0.3s, transform 0.15s',
        userSelect: 'none',
        minWidth: '82px',
        justifyContent: 'center',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--color-primary)';
        e.currentTarget.style.boxShadow = `0 0 18px var(--sp-accent-glow), var(--shadow-md)`;
        e.currentTarget.style.transform = 'scale(1.04)';
        e.currentTarget.style.color = 'var(--color-foreground)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.color = 'var(--color-muted-foreground)';
      }}
    >
      <span style={{ fontSize: '13px', lineHeight: 1 }}>
        {isDark ? '🌙' : '☀️'}
      </span>
      <span>{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
};

export default ThemeToggle;