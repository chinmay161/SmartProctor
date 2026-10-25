import React, { useState, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Link } from 'react-router-dom';

/* ─────────────── helpers ─────────────── */

const EyeIcon = ({ open }) =>
  open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '15px', height: '15px' }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '15px', height: '15px' }}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
    </svg>
  );

const GoogleIcon = () => (
  <svg style={{ width: '17px', height: '17px' }} viewBox="0 0 24 24" fill="none">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

/* Password strength */
const calcStrength = (password) => {
  if (!password) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[@$!%*?&^#~]/.test(password)) score++;
  if (score <= 1) return { score, label: 'Weak', color: '#EF4444' };
  if (score <= 2) return { score, label: 'Fair', color: '#F59E0B' };
  if (score <= 3) return { score, label: 'Good', color: '#3B82F6' };
  return { score, label: 'Strong', color: '#10B981' };
};

/* ─────────────── AuthField ─────────────── */

const inputBase = {
  fontFamily: 'var(--auth-font-body)',
  fontSize: '0.86rem',
  color: 'var(--auth-text-primary)',
  background: 'var(--auth-surface-2)',
  border: '1px solid var(--auth-border)',
  borderRadius: '8px',
  padding: '8px 12px',
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
};

const AuthField = ({ label, id, error, children }) => (
  <div className="auth-input-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <label
      htmlFor={id}
      style={{
        fontFamily: 'var(--auth-font-body)',
        fontSize: '0.76rem',
        fontWeight: 500,
        color: error ? 'var(--auth-error)' : 'var(--auth-text-secondary)',
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </label>
    {children}
    {error && (
      <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.7rem', color: 'var(--auth-error)', marginTop: '1px' }}>
        {error}
      </p>
    )}
  </div>
);

/* ─────────────── SignupForm ─────────────── */

const SignupForm = () => {
  const { loginWithRedirect } = useAuth0();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    institution: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const strength = calcStrength(formData.password);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  }, [errors]);

  const validateForm = () => {
    const errs = {};
    if (!formData.firstName?.trim()) errs.firstName = 'First name is required';
    if (!formData.lastName?.trim())  errs.lastName  = 'Last name is required';
    if (!formData.email?.trim())     errs.email     = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = 'Please enter a valid email address';
    if (!formData.institution?.trim()) errs.institution = 'Institution is required';
    if (!formData.password)           errs.password = 'Password is required';
    else if (formData.password.length < 8) errs.password = 'At least 8 characters required';
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(formData.password))
      errs.password = 'Must include upper, lower, number & symbol';
    if (!formData.confirmPassword)    errs.confirmPassword = 'Confirm your password';
    else if (formData.password !== formData.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) { triggerShake(); return; }
    try {
      setIsLoading(true);
      await loginWithRedirect({ screen_hint: 'signup', appState: { returnTo: '/student-dashboard' } });
    } catch {
      setErrors({ submit: 'Unable to open signup. Please try again.' });
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setIsLoading(true);
      await loginWithRedirect({ connection: 'google-oauth2', screen_hint: 'signup', appState: { returnTo: '/student-dashboard' } });
    } catch {
      setIsLoading(false);
      setErrors({ submit: 'Failed to sign up with Google. Please try again.' });
    }
  };

  const strengthBarWidth = `${Math.min((strength.score / 5) * 100, 100)}%`;

  return (
    <div
      className={shake ? 'auth-shake' : ''}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '11px' }}
    >
      {/* Heading */}
      <div className="auth-fade-up" style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontFamily: 'var(--auth-font-display)',
            fontSize: '1.6rem',
            color: 'var(--auth-text-primary)',
            fontWeight: 400,
            lineHeight: 1.15,
            marginBottom: '3px',
          }}
        >
          Create Account
        </h1>
        <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.82rem', color: 'var(--auth-text-secondary)' }}>
          Join SmartProctor for secure exam proctoring
        </p>
      </div>

      {/* Google signup */}
      <button
        id="signup-google-btn"
        type="button"
        onClick={handleGoogleSignup}
        disabled={isLoading}
        className="auth-fade-up-1"
        style={{
          width: '100%',
          padding: '9px 12px',
          borderRadius: '8px',
          background: 'var(--auth-surface-2)',
          border: '1px solid var(--auth-border)',
          color: 'var(--auth-text-primary)',
          fontFamily: 'var(--auth-font-body)',
          fontSize: '0.85rem',
          fontWeight: 500,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.6 : 1,
          transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '9px',
        }}
        onMouseEnter={e => { if (!isLoading) { e.currentTarget.style.borderColor = 'var(--auth-accent)'; e.currentTarget.style.transform = 'scale(1.006)'; } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--auth-border)'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <GoogleIcon />
        {isLoading ? 'Redirecting…' : 'Sign up with Google'}
      </button>

      {/* Divider */}
      <div className="auth-fade-up-1" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '1px 0' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--auth-border)' }} />
        <span style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.68rem', color: 'var(--auth-text-secondary)', letterSpacing: '0.04em' }}>OR CONTINUE WITH EMAIL</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--auth-border)' }} />
      </div>

      {/* Error banner */}
      {errors.submit && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '7px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            fontFamily: 'var(--auth-font-body)',
            fontSize: '0.8rem',
            color: 'var(--auth-error)',
          }}
        >
          {errors.submit}
        </div>
      )}

      {/* Row 1: First + Last Name */}
      <div className="auth-fade-up-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <AuthField label="First Name" id="signup-first-name" error={errors.firstName}>
          <input
            id="signup-first-name"
            type="text"
            placeholder="Jane"
            value={formData.firstName}
            onChange={e => handleInputChange('firstName', e.target.value)}
            disabled={isLoading}
            className="auth-input"
            style={{ ...inputBase, borderColor: errors.firstName ? 'var(--auth-error)' : undefined }}
          />
        </AuthField>
        <AuthField label="Last Name" id="signup-last-name" error={errors.lastName}>
          <input
            id="signup-last-name"
            type="text"
            placeholder="Doe"
            value={formData.lastName}
            onChange={e => handleInputChange('lastName', e.target.value)}
            disabled={isLoading}
            className="auth-input"
            style={{ ...inputBase, borderColor: errors.lastName ? 'var(--auth-error)' : undefined }}
          />
        </AuthField>
      </div>

      {/* Row 2: Email + Institution */}
      <div className="auth-fade-up-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <AuthField label="Email Address" id="signup-email" error={errors.email}>
          <input
            id="signup-email"
            type="email"
            placeholder="you@institution.edu"
            value={formData.email}
            onChange={e => handleInputChange('email', e.target.value)}
            disabled={isLoading}
            className="auth-input"
            style={{ ...inputBase, borderColor: errors.email ? 'var(--auth-error)' : undefined }}
          />
        </AuthField>
        <AuthField label="Institution / Organization" id="signup-institution" error={errors.institution}>
          <input
            id="signup-institution"
            type="text"
            placeholder="MIT, Harvard, Coursera…"
            value={formData.institution}
            onChange={e => handleInputChange('institution', e.target.value)}
            disabled={isLoading}
            className="auth-input"
            style={{ ...inputBase, borderColor: errors.institution ? 'var(--auth-error)' : undefined }}
          />
        </AuthField>
      </div>

      {/* Row 3: Password + Confirm Password */}
      <div className="auth-fade-up-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <AuthField label="Password" id="signup-password" error={errors.password}>
            <div style={{ position: 'relative' }}>
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 chars · mixed"
                value={formData.password}
                onChange={e => handleInputChange('password', e.target.value)}
                disabled={isLoading}
                className="auth-input"
                style={{
                  ...inputBase,
                  paddingRight: '38px',
                  borderColor: errors.password ? 'var(--auth-error)' : undefined,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--auth-text-secondary)',
                  cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center',
                }}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </AuthField>

          {/* Strength bar directly below password input */}
          {formData.password && (
            <div style={{ marginTop: '5px' }}>
              <div
                style={{
                  width: '100%',
                  height: '3px',
                  borderRadius: '2px',
                  background: 'var(--auth-border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="auth-strength-bar"
                  style={{ width: strengthBarWidth, background: strength.color }}
                />
              </div>
              <p style={{ fontFamily: 'var(--auth-font-body)', fontSize: '0.68rem', color: strength.color, marginTop: '2px', fontWeight: 500 }}>
                {strength.label}
              </p>
            </div>
          )}
        </div>

        <div>
          <AuthField label="Confirm Password" id="signup-confirm-password" error={errors.confirmPassword}>
            <div style={{ position: 'relative' }}>
              <input
                id="signup-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={e => handleInputChange('confirmPassword', e.target.value)}
                disabled={isLoading}
                className="auth-input"
                style={{
                  ...inputBase,
                  paddingRight: '38px',
                  borderColor: errors.confirmPassword ? 'var(--auth-error)' : undefined,
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(v => !v)}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--auth-text-secondary)',
                  cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center',
                }}
              >
                <EyeIcon open={showConfirmPassword} />
              </button>
            </div>
          </AuthField>
        </div>
      </div>

      {/* Create Account CTA */}
      <button
        id="signup-submit-btn"
        type="button"
        onClick={handleSubmit}
        disabled={isLoading}
        className="auth-cta-btn auth-fade-up-5"
        style={{
          width: '100%',
          padding: '10px',
          borderRadius: '8px',
          background: isLoading ? 'var(--auth-accent-hover)' : 'var(--auth-accent)',
          color: '#fff',
          fontFamily: 'var(--auth-font-body)',
          fontSize: '0.92rem',
          fontWeight: 600,
          border: 'none',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
          transition: 'background 0.2s, transform 0.15s, box-shadow 0.2s',
          letterSpacing: '0.01em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginTop: '2px',
        }}
      >
        {isLoading ? (
          <svg style={{ width: '15px', height: '15px' }} className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ) : 'Create Account'}
      </button>

      {/* Already have account */}
      <p
        className="auth-fade-up-5"
        style={{ textAlign: 'center', fontFamily: 'var(--auth-font-body)', fontSize: '0.82rem', color: 'var(--auth-text-secondary)' }}
      >
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--auth-accent)', fontWeight: 600, textDecoration: 'none' }}>
          Sign In
        </Link>
      </p>
    </div>
  );
};

export default SignupForm;
