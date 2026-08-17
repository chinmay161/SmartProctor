import React, { useEffect } from 'react';
import SignupForm from './components/SignupForm';
import ThemeToggle from '../../components/ui/ThemeToggle';

/* ── Shared left panel (mirrors login, no separate component needed at this scale) ── */
const brandFeatures = [
  { icon: '🎓', title: 'University-grade integrity', desc: 'Trusted by 500+ institutions for high-stakes exams' },
  { icon: '🤖', title: 'AI proctoring engine',        desc: 'Computer-vision based gaze & behaviour analysis' },
  { icon: '🔒', title: 'Zero-trust security',          desc: 'End-to-end encryption & SOC 2 certified infrastructure' },
];

const SignupBrandPanel = () => (
  <div
    className="hidden lg:flex lg:flex-col lg:justify-between auth-brand-bg"
    style={{ width: '40%', minHeight: '100vh', padding: '3rem 2.5rem', position: 'relative', overflow: 'hidden' }}
  >
    {/* Glow accents */}
    <div style={{ position: 'absolute', top: '-80px', left: '-80px', width: '340px', height: '340px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
    <div style={{ position: 'absolute', bottom: '-60px', right: '-60px', width: '260px', height: '260px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

    <div className="auth-fade-up-1" style={{ position: 'relative', zIndex: 1 }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2.5rem' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
        <h2 style={{ fontFamily: 'var(--auth-font-display)', fontSize: 'clamp(1.75rem, 2.5vw, 2.25rem)', color: 'var(--auth-text-primary)', lineHeight: 1.2, marginBottom: '0.75rem', fontWeight: 400 }}>
          Start Proctoring<br />
          <em style={{ color: 'var(--auth-accent)' }}>With Confidence.</em>
        </h2>
        <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.9rem', color: 'var(--auth-text-secondary)', lineHeight: 1.7, maxWidth: '340px' }}>
          Set up your institution account in minutes. Get instant access to our full proctoring suite.
        </p>
      </div>

      {/* Feature list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {brandFeatures.map((f, i) => (
          <div
            key={i}
            className={`auth-fade-up-${i + 2}`}
            style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(59,130,246,0.1)', transition: 'border-color 0.25s, background 0.25s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'; e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
          >
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(59,130,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1rem' }}>
              {f.icon}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--auth-font-body)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--auth-text-primary)', marginBottom: '3px' }}>{f.title}</p>
              <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.8rem', color: 'var(--auth-text-secondary)', lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Bottom trust */}
    <div className="auth-fade-up-5" style={{ position: 'relative', zIndex: 1, marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(59,130,246,0.1)' }}>
      <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.78rem', color: 'var(--auth-text-secondary)', lineHeight: 1.6 }}>
        🏛 Trusted by <strong style={{ color: 'var(--auth-text-primary)' }}>500+</strong> universities ·
        &nbsp;<strong style={{ color: 'var(--auth-text-primary)' }}>2M+</strong> exams proctored
      </p>
    </div>
  </div>
);

/* ─────────────── Page ─────────────── */

const Signup = () => {
  useEffect(() => {
    document.title = 'Sign Up — SmartProctor | Create Your Account';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        'content',
        'Create a SmartProctor account for AI-powered secure online exam proctoring with real-time monitoring and comprehensive anti-cheating measures.'
      );
    }
  }, []);

  return (
    <>
      <ThemeToggle />

      <div
        style={{
          minHeight: '100vh',
          background: 'var(--auth-bg)',
          display: 'flex',
          transition: 'background 0.3s, color 0.3s',
        }}
      >
        {/* Left brand panel */}
        <SignupBrandPanel />

        {/* Right form panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(1.5rem, 4vw, 3rem)',
            minHeight: '100vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ width: '100%', maxWidth: '500px', paddingTop: '1rem', paddingBottom: '1rem' }}>
            {/* Mobile-only logo */}
            <div
              className="lg:hidden auth-fade-up"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                marginBottom: '2rem',
              }}
            >
              <div
                style={{
                  width: '40px', height: '40px', borderRadius: '9px',
                  background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--auth-accent)" strokeWidth="2" style={{ width: '20px', height: '20px' }}>
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </div>
              <span style={{ fontFamily: 'var(--auth-font-display)', fontSize: '1.4rem', color: 'var(--auth-text-primary)', fontWeight: 600 }}>
                SmartProctor
              </span>
            </div>

            <SignupForm />
          </div>
        </div>
      </div>
    </>
  );
};

export default Signup;
