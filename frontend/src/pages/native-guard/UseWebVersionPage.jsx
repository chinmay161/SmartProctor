import React, { useState } from 'react';
import { useSession } from '../../context/SessionContext';
import ThemeToggle from '../../components/ui/ThemeToggle';

/**
 * UseWebVersionPage
 * Native guard page shown when a teacher or admin accesses the native mobile app,
 * or when /use-web-version is opened directly.
 * Prompts user with desktop URL, one-tap copy, and clear logout.
 */
const UseWebVersionPage = () => {
  const { logout } = useSession();
  const [copied, setCopied] = useState(false);

  const rawUrl =
    import.meta.env.VITE_WEB_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://app.smartproctor.io');
  const webAppUrl = String(rawUrl).replace(/\/+$/, '');

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(webAppUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback feedback if clipboard permission was denied
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4"
      style={{
        background: 'var(--color-background)',
        paddingTop: 'max(1.5rem, calc(1rem + var(--safe-top, 0px)))',
        paddingBottom: 'max(1.5rem, calc(1rem + var(--safe-bottom, 0px)))',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <ThemeToggle floating />

      <div
        className="sp-card sp-scale-in"
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '32px 24px',
          textAlign: 'center',
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-xl)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow Accent */}
        <div
          style={{
            position: 'absolute',
            top: '-50px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Desktop Device Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--sp-accent)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="32"
            height="32"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            color: 'var(--color-foreground)',
            fontWeight: 600,
            marginBottom: '10px',
            lineHeight: 1.25,
          }}
        >
          Use the Web Version
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.6,
            marginBottom: '24px',
          }}
        >
          The SmartProctor mobile app is designed specifically for students taking exams.
          Teacher and administrator features—including question banks, exam creation, live proctoring,
          and result reviews—require a desktop browser.
        </p>

        {/* Web Address Box with Copy */}
        <div
          style={{
            background: 'var(--color-muted)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            textAlign: 'left',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                color: 'var(--color-muted-foreground)',
                marginBottom: '2px',
              }}
            >
              Desktop Web URL
            </span>
            <span
              id="web-app-url-display"
              style={{
                display: 'block',
                fontFamily: 'var(--font-data)',
                fontSize: '14px',
                color: 'var(--color-foreground)',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {webAppUrl}
            </span>
          </div>

          <button
            id="copy-web-url-btn"
            type="button"
            onClick={handleCopy}
            className="touch-target"
            title="Copy URL to clipboard"
            style={{
              flexShrink: 0,
              padding: '8px 12px',
              borderRadius: '8px',
              background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.12)',
              border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(59,130,246,0.3)'}`,
              color: copied ? 'var(--sp-success)' : 'var(--sp-accent)',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {copied ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>

        {/* Log out Button */}
        <button
          id="web-version-logout-btn"
          type="button"
          onClick={() => logout()}
          className="touch-target"
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: '10px',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--sp-error)';
            e.currentTarget.style.color = 'var(--sp-error)';
            e.currentTarget.style.background = 'rgba(239,68,68,0.07)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.color = 'var(--color-foreground)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log out
        </button>
      </div>
    </div>
  );
};

export default UseWebVersionPage;
