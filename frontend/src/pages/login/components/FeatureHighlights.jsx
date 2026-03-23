import React from 'react';

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
        <path d="M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
        <path d="M2 10C2 10 5.5 3 12 3s10 7 10 7-3.5 7-10 7S2 10 2 10z" />
      </svg>
    ),
    title: 'AI-Powered Proctoring',
    description: 'Real-time gaze, face & behaviour analysis using computer vision',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: 'Browser Lockdown',
    description: 'Zero tab-switching, screenshot, or external app access during exams',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: 'Tamper-Proof Reports',
    description: 'Cryptographically signed violation logs with chain-of-custody',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
        <path d="M3 3h18v18H3z" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
    title: 'Institutional Dashboard',
    description: 'Cohort-level analytics, live exam oversight & audit trails',
  },
];

const FeatureHighlights = () => (
  <div
    className="hidden lg:flex lg:flex-col lg:justify-between auth-brand-bg"
    style={{
      width: '40%',
      minHeight: '100vh',
      padding: '3rem 2.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* Radial glow accent */}
    <div
      style={{
        position: 'absolute',
        top: '-80px',
        left: '-80px',
        width: '360px',
        height: '360px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}
    />
    <div
      style={{
        position: 'absolute',
        bottom: '-60px',
        right: '-60px',
        width: '280px',
        height: '280px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}
    />

    {/* Top — Logo & tagline */}
    <div className="auth-fade-up-1" style={{ position: 'relative', zIndex: 1 }}>
      {/* Logo mark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2.5rem' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--auth-accent)" strokeWidth="2" style={{ width: '22px', height: '22px' }}>
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>
        <span style={{ fontFamily: 'var(--auth-font-display)', fontSize: '1.5rem', color: 'var(--auth-text-primary)', fontWeight: 600 }}>
          SmartProctor
        </span>
      </div>

      {/* Hero text */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2
          style={{
            fontFamily: 'var(--auth-font-display)',
            fontSize: 'clamp(1.75rem, 2.5vw, 2.25rem)',
            color: 'var(--auth-text-primary)',
            lineHeight: 1.2,
            marginBottom: '0.75rem',
            fontWeight: 400,
          }}
        >
          Academic Integrity,<br />
          <em style={{ color: 'var(--auth-accent)' }}>Redefined.</em>
        </h2>
        <p
          style={{
            fontFamily: 'var(--auth-font-body)',
            fontSize: '0.9rem',
            color: 'var(--auth-text-secondary)',
            lineHeight: 1.7,
            maxWidth: '340px',
          }}
        >
          Enterprise-grade remote exam proctoring trusted by universities and certification bodies worldwide.
        </p>
      </div>

      {/* Feature list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {features.map((f, i) => (
          <div
            key={i}
            className={`auth-fade-up-${i + 2}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(59,130,246,0.1)',
              transition: 'border-color 0.25s, background 0.25s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)';
              e.currentTarget.style.background = 'rgba(59,130,246,0.06)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.1)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            }}
          >
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'rgba(59,130,246,0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--auth-accent)',
                flexShrink: 0,
                marginTop: '1px',
              }}
            >
              {f.icon}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--auth-font-body)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--auth-text-primary)', marginBottom: '3px' }}>
                {f.title}
              </p>
              <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.8rem', color: 'var(--auth-text-secondary)', lineHeight: 1.5 }}>
                {f.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Bottom — Trust statement */}
    <div
      className="auth-fade-up-6"
      style={{
        position: 'relative',
        zIndex: 1,
        marginTop: '2rem',
        paddingTop: '1.5rem',
        borderTop: '1px solid rgba(59,130,246,0.1)',
      }}
    >
      <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.78rem', color: 'var(--auth-text-secondary)', lineHeight: 1.6 }}>
        🏛 Trusted by <strong style={{ color: 'var(--auth-text-primary)' }}>500+</strong> universities · 
        &nbsp;<strong style={{ color: 'var(--auth-text-primary)' }}>2M+</strong> exams proctored
      </p>
    </div>
  </div>
);

export default FeatureHighlights;