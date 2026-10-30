import React, { useState, useRef, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthTransitionSkeleton } from '../../../components/ui/Skeleton';
import { isNativeApp, openUrl, getAppVersion } from '../../../utils/platform';

/* ─────────────── helpers ─────────────── */

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

/* ─────────────── AuthField ─────────────── */

const AuthField = ({ label, id, error, children }) => (
  <div className="auth-input-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label
      htmlFor={id}
      className="auth-field-label"
      style={{
        fontFamily: 'var(--auth-font-body)',
        fontSize: '0.8rem',
        fontWeight: 500,
        color: error ? 'var(--auth-error)' : 'var(--auth-text-secondary)',
        letterSpacing: '0.02em',
      }}
    >
      {label}
    </label>
    {children}
    {error && (
      <p className="auth-field-error" style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.75rem', color: 'var(--auth-error)', marginTop: '2px' }}>
        {error}
      </p>
    )}
  </div>
);

const inputBase = {
  fontFamily: 'var(--auth-font-body)',
  fontSize: '0.9rem',
  color: 'var(--auth-text-primary)',
  background: 'var(--auth-surface-2)',
  border: '1px solid var(--auth-border)',
  borderRadius: '8px',
  padding: '10px 14px',
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
};

/* ─────────────── LoginForm ─────────────── */

const LoginForm = () => {
  const [formData, setFormData] = useState({ email: '', rememberMe: false });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState('Authenticating and loading workspace...');
  const [shake, setShake] = useState(false);
  const { loginWithRedirect, isLoading: auth0Loading } = useAuth0();
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState('v1.0.0');
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    getAppVersion().then((v) => {
      if (mounted && v) setAppVersion(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleVersionTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2500);

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      navigate('/app-spike');
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.email?.trim()) newErrors.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Please enter a valid email address';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  // Password entry happens on Auth0 Universal Login; the email is passed as a hint.
  const handleSubmit = async () => {
    if (!validateForm()) { triggerShake(); return; }
    try {
      setIsLoading(true);
      setTransitionMessage('Redirecting to secure sign-in...');
      setIsRedirecting(true);
      try {
        sessionStorage.setItem('auth_redirect_to_dashboard', 'true');
      } catch {
        // Ignore storage exceptions in private mode
      }
      await loginWithRedirect({
        ...(isNativeApp() ? { openUrl } : {}),
        appState: { returnTo: '/login' },
        authorizationParams: { login_hint: formData.email.trim(), screen_hint: 'login' },
      });
    } catch {
      try {
        sessionStorage.removeItem('auth_redirect_to_dashboard');
      } catch {
        // Ignore storage exceptions
      }
      setIsRedirecting(false);
      setIsLoading(false);
      setErrors({ submit: 'Sign-in failed. Please try again.' });
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setTransitionMessage('Redirecting to Google sign-in...');
      setIsRedirecting(true);
      try {
        sessionStorage.setItem('auth_redirect_to_dashboard', 'true');
      } catch {
        // Ignore storage exceptions in private mode
      }
      await loginWithRedirect({
        ...(isNativeApp() ? { openUrl } : {}),
        appState: { returnTo: '/login' },
        authorizationParams: { connection: 'google-oauth2' },
      });
    } catch {
      try {
        sessionStorage.removeItem('auth_redirect_to_dashboard');
      } catch {
        // Ignore storage exceptions
      }
      setIsRedirecting(false);
      setIsLoading(false);
      setErrors({ submit: 'Google sign-in failed. Please try again.' });
    }
  };

  if (isRedirecting) {
    return <AuthTransitionSkeleton message={transitionMessage} />;
  }

  const busy = isLoading || auth0Loading;

  return (
    <div
      className={shake ? 'auth-shake' : ''}
      style={{
        width: '100%',
        maxWidth: '440px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Heading */}
      <div className="auth-fade-up" style={{ textAlign: 'center', marginBottom: '4px' }}>
        <h1
          style={{
            fontFamily: 'var(--auth-font-display)',
            fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
            color: 'var(--auth-text-primary)',
            fontWeight: 400,
            lineHeight: 1.15,
            marginBottom: '8px',
          }}
        >
          Welcome Back
        </h1>
        <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.9rem', color: 'var(--auth-text-secondary)' }}>
          Sign in to your SmartProctor dashboard
        </p>
      </div>

      {/* Submit error */}
      {errors.submit && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            fontFamily: 'var(--auth-font-body)',
            fontSize: '0.83rem',
            color: 'var(--auth-error)',
          }}
        >
          {errors.submit}
        </div>
      )}

      {/* Email */}
      <AuthField label="Email Address" id="login-email" error={errors.email}>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@institution.edu"
          value={formData.email}
          onChange={e => handleInputChange('email', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={busy}
          className="auth-input"
          style={{
            ...inputBase,
            borderColor: errors.email ? 'var(--auth-error)' : undefined,
          }}
        />
      </AuthField>

      {/* Remember me + Forgot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <label
          htmlFor="login-remember"
          className="auth-checkbox-label"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontFamily: 'var(--auth-font-body)',
            fontSize: '0.83rem',
            color: 'var(--auth-text-secondary)',
            userSelect: 'none',
          }}
        >
          <input
            id="login-remember"
            type="checkbox"
            checked={formData.rememberMe}
            onChange={e => handleInputChange('rememberMe', e.target.checked)}
            style={{
              accentColor: 'var(--auth-accent)',
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          />
          <span>Remember me</span>
        </label>
        <button
          type="button"
          className="auth-touch-btn auth-helper-text"
          style={{
            background: 'none',
            border: 'none',
            fontFamily: 'var(--auth-font-body)',
            fontSize: '0.83rem',
            color: 'var(--auth-accent)',
            cursor: 'pointer',
            padding: '8px 4px',
            transition: 'opacity 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Forgot Password?
        </button>
      </div>

      {/* Sign In CTA */}
      <button
        id="login-submit-btn"
        type="button"
        onClick={handleSubmit}
        disabled={busy}
        className="auth-cta-btn"
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '9px',
          background: busy ? 'var(--auth-accent-hover)' : 'var(--auth-accent)',
          color: '#fff',
          fontFamily: 'var(--auth-font-body)',
          fontSize: '0.95rem',
          fontWeight: 600,
          border: 'none',
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.7 : 1,
          transition: 'background 0.2s, transform 0.15s, box-shadow 0.2s',
          letterSpacing: '0.01em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {busy ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ) : (
          <>Sign In →</>
        )}
      </button>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--auth-border)' }} />
        <span style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.75rem', color: 'var(--auth-text-secondary)' }}>or</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--auth-border)' }} />
      </div>

      {/* Google Sign In */}
      <button
        id="login-google-btn"
        type="button"
        onClick={handleGoogleSignIn}
        disabled={busy}
        className="auth-touch-btn touch-target"
        style={{
          width: '100%',
          padding: '11px',
          borderRadius: '9px',
          background: 'var(--auth-surface-2)',
          border: '1px solid var(--auth-border)',
          color: 'var(--auth-text-primary)',
          fontFamily: 'var(--auth-font-body)',
          fontSize: '0.88rem',
          fontWeight: 500,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
          transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
        }}
        onMouseEnter={e => { if (!busy) { e.currentTarget.style.borderColor = 'var(--auth-accent)'; e.currentTarget.style.transform = 'scale(1.009)'; } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--auth-border)'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <GoogleIcon />
        {busy ? 'Signing in…' : 'Continue with Google'}
      </button>

      {/* Create account link */}
      <p className="auth-helper-text" style={{ textAlign: 'center', fontFamily: 'var(--auth-font-body)', fontSize: '0.85rem', color: 'var(--auth-text-secondary)' }}>
        Don't have an account?{' '}
        <Link
          to="/signup"
          style={{ color: 'var(--auth-accent)', fontWeight: 600, textDecoration: 'none' }}
        >
          Create Account
        </Link>
      </p>

      {/* Trust badges */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--auth-border)',
          flexWrap: 'wrap',
        }}
      >
        {['🔒 SSL Secured', 'FERPA Compliant', 'SOC 2 Certified'].map(badge => (
          <span
            key={badge}
            className="auth-trust-badge"
            style={{
              fontFamily: 'var(--auth-font-body)',
              fontSize: '0.72rem',
              color: 'var(--auth-text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {badge}
          </span>
        ))}
      </div>

      {/* Version text - tap 5 times to launch on-device benchmark */}
      <div style={{ textAlign: 'center', marginTop: '12px' }}>
        <span
          onClick={handleVersionTap}
          className="auth-helper-text"
          style={{
            fontFamily: 'var(--auth-font-body)',
            fontSize: '0.7rem',
            color: 'var(--auth-text-secondary)',
            opacity: 0.65,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          title={`${appVersion} (tap 5 times for diagnostic benchmark)`}
        >
          {appVersion}
        </span>
      </div>
    </div>
  );
};

export default LoginForm;
