import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
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
        className="min-h-dvh"
        style={{
          background: 'var(--auth-bg)',
          display: 'flex',
          transition: 'background 0.3s, color 0.3s',
        }}
      >
        {/* Left brand panel */}
        <FeatureHighlights />

        {/* Right form panel */}
        <div
          className="auth-scroll-panel min-h-dvh"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(1.5rem, 4vw, 3rem)',
          }}
        >
          <div style={{ width: '100%', maxWidth: '460px' }}>
            {/* Mobile-only brand */}
            <Link
              to="/"
              className="lg:hidden auth-fade-up auth-mobile-logo"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '2rem',
                textDecoration: 'none',
              }}
            >
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
            </Link>

            <LoginForm />
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
