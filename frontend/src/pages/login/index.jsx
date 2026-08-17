import React, { useEffect } from 'react';
import LoginForm from './components/LoginForm';
import FeatureHighlights from './components/FeatureHighlights';
import ThemeToggle from '../../components/ui/ThemeToggle';

const Login = () => {
  useEffect(() => {
    document.title = 'Login — SmartProctor | Secure Online Exam Proctoring';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        'content',
        'Sign in to SmartProctor for AI-powered secure online exam proctoring with real-time monitoring and comprehensive anti-cheating measures.'
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
        <FeatureHighlights />

        {/* Right form panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(1.5rem, 4vw, 3rem)',
            minHeight: '100vh',
          }}
        >
          <div style={{ width: '100%', maxWidth: '460px' }}>
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
                  width: '40px',
                  height: '40px',
                  borderRadius: '9px',
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--auth-accent)" strokeWidth="2" style={{ width: '20px', height: '20px' }}>
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: 'var(--auth-font-display)',
                  fontSize: '1.4rem',
                  color: 'var(--auth-text-primary)',
                  fontWeight: 600,
                }}
              >
                SmartProctor
              </span>
            </div>

            <LoginForm />
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
