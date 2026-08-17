import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import authService from '../../../services/authService';
import { apiRequest } from '../../../services/api';
import { apiGet } from '../../../services/httpClient';
import { useNavigate, Link } from 'react-router-dom';
import { dashboardForRoles, extractRolesFromAuth0User } from '../../../utils/roleUtils';

/* ─────────────── helpers ─────────────── */

const EyeIcon = ({ open }) =>
  open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
    </svg>
  );

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
      <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.75rem', color: 'var(--auth-error)', marginTop: '2px' }}>
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
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '', rememberMe: false });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const { loginWithPopup, isLoading: auth0Loading, user: auth0User, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.email?.trim()) newErrors.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Please enter a valid email address';
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const resolveDestinationWithFallback = async ({ includeAuth0ProfileFallback = false } = {}) => {
    const destinationFromProfile = (profile) => {
      const roles = Array.isArray(profile?.roles) && profile.roles.length > 0
        ? profile.roles
        : (profile?.role ? [profile.role] : []);
      return dashboardForRoles(roles);
    };
    const rolesFromClaim = extractRolesFromAuth0User(auth0User);
    if (rolesFromClaim.length > 0) return dashboardForRoles(rolesFromClaim);
    if (includeAuth0ProfileFallback) {
      try {
        const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Audience } });
        const profile = await apiRequest('/profile/me', 'GET', null, token);
        const dest = destinationFromProfile(profile);
        if (dest !== '/login') return dest;
      } catch (_) { /* continue */ }
    }
    try {
      const profile = await apiGet('/profile/me');
      const dest = destinationFromProfile(profile);
      if (dest !== '/login') return dest;
    } catch (_) { /* no role */ }
    return '/login';
  };

  const handleSubmit = async () => {
    if (!validateForm()) { triggerShake(); return; }
    setIsLoading(true);
    try {
      await authService.loginUser(formData.email, formData.password, false, null);
      const destination = await resolveDestinationWithFallback();
      if (destination === '/login') { setErrors({ submit: 'Role not available. Contact admin.' }); return; }
      navigate(destination);
    } catch {
      setErrors({ email: 'Invalid credentials or login failed', password: '' });
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await loginWithPopup({ connection: 'google-oauth2', screen_hint: 'login' });
      const destination = await resolveDestinationWithFallback({ includeAuth0ProfileFallback: true });
      if (destination === '/login') { setErrors({ submit: 'Role not available. Contact admin.' }); return; }
      navigate(destination);
    } catch {
      setErrors({ submit: 'Google sign-in failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

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

      {/* Password */}
      <AuthField label="Password" id="login-password" error={errors.password}>
        <div style={{ position: 'relative' }}>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            value={formData.password}
            onChange={e => handleInputChange('password', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            disabled={busy}
            className="auth-input"
            style={{
              ...inputBase,
              paddingRight: '42px',
              borderColor: errors.password ? 'var(--auth-error)' : undefined,
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--auth-text-secondary)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>
      </AuthField>

      {/* Remember me + Forgot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label
          style={{
            display: 'flex',
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
              width: '15px',
              height: '15px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          />
          Remember me
        </label>
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            fontFamily: 'var(--auth-font-body)',
            fontSize: '0.83rem',
            color: 'var(--auth-accent)',
            cursor: 'pointer',
            padding: 0,
            transition: 'opacity 0.2s',
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
      <p style={{ textAlign: 'center', fontFamily: 'var(--auth-font-body)', fontSize: '0.85rem', color: 'var(--auth-text-secondary)' }}>
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
    </div>
  );
};

export default LoginForm;
