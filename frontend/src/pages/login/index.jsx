import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import ThemeToggle from '../../components/ui/ThemeToggle';
import SmartProctorLogo from '../../components/ui/SmartProctorLogo';
import AppFooter from '../../components/ui/AppFooter';
import NeonGridBackground from '../../components/ui/NeonGridBackground';

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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <ThemeToggle />
      <NeonGridBackground />

      <div
        style={{
          flex: 1,
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(1.5rem, 4vw, 3rem)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ width: '100%', maxWidth: '440px' }}>
          {/* Brand Logo & Home Link */}
          <div
            className="auth-fade-up"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '2rem',
            }}
          >
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                textDecoration: 'none',
              }}
              title="Return to home page"
            >
              <SmartProctorLogo size={42} />
              <span
                style={{
                  fontFamily: 'var(--auth-font-display)',
                  fontSize: '1.6rem',
                  color: 'var(--auth-text-primary)',
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                }}
              >
                Smart<span style={{ color: 'var(--auth-accent)' }}>Proctor</span>
              </span>
            </Link>
          </div>

          <LoginForm />
        </div>
      </div>
      <AppFooter />
    </div>
  );
};

export default Login;
