import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';

const SignupForm = () => {
  const { loginWithRedirect } = useAuth0();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    institution: '',
    agreeTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const validateForm = () => {
    const newErrors = {};

    // First name validation
    if (!formData?.firstName?.trim()) {
      newErrors.firstName = 'First name is required';
    }

    // Last name validation
    if (!formData?.lastName?.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    // Email validation
    if (!formData?.email?.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData?.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!formData?.password) {
      newErrors.password = 'Password is required';
    } else if (formData?.password?.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(formData?.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, number, and special character';
    }

    // Confirm password validation
    if (!formData?.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData?.password !== formData?.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // Institution validation
    if (!formData?.institution?.trim()) {
      newErrors.institution = 'Institution name is required';
    }

    // Terms validation
    if (!formData?.agreeTerms) {
      newErrors.agreeTerms = 'You must agree to the terms and conditions';
    }

    setErrors(newErrors);
    return Object.keys(newErrors)?.length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors?.[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setErrors({});
      setIsLoading(true);
      // Use redirect flow instead of popup to avoid cross-origin window.close issues
      await loginWithRedirect({
        connection: 'google-oauth2',
        appState: { returnTo: '/student-dashboard' },
        screen_hint: 'signup',
      });
    } catch (error) {
      setIsLoading(false);
      console.error('Error signing up with Google:', error);
      
      // Only show specific error messages, not generic errors
      if (error?.error !== 'popup_closed') {
        setErrors({
          submit: 'Failed to sign up with Google. Please try again or use email/password.'
        });
      }
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();

    // Let Auth0 handle signup (hosted page)
    try {
      await loginWithRedirect({ screen_hint: 'signup', appState: { returnTo: '/student-dashboard' } });
    } catch (err) {
      console.error('Redirect to Auth0 signup failed', err);
      setErrors({ submit: 'Unable to open signup. Please try the Google signup or try again.' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Heading */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">Create Account</h2>
        <p className="text-sm text-muted-foreground">
          Join SmartProctor for secure exam proctoring
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">{successMessage}</p>
        </div>
      )}

      {/* Error Message */}
      {errors?.submit && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{errors.submit}</p>
        </div>
      )}

      {/* Google Sign Up Button */}
      <button
        type="button"
        onClick={handleGoogleSignup}
        disabled={isLoading}
        className="w-full px-4 py-2.5 border border-input hover:bg-accent hover:border-primary rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        <span className="font-medium text-sm">
          {isLoading ? 'Signing up with Google...' : 'Sign up with Google'}
        </span>
      </button>

      {/* Divider */}
      <div className="flex items-center space-x-3">
        <div className="flex-1 h-px bg-border"></div>
        <span className="text-xs text-muted-foreground font-medium">OR</span>
        <div className="flex-1 h-px bg-border"></div>
      </div>

      {/* Name Fields */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First Name"
          type="text"
          value={formData?.firstName}
          onChange={(e) => handleInputChange('firstName', e.target.value)}
          placeholder="John"
          error={errors?.firstName}
          required
        />
        <Input
          label="Last Name"
          type="text"
          value={formData?.lastName}
          onChange={(e) => handleInputChange('lastName', e.target.value)}
          placeholder="Doe"
          error={errors?.lastName}
          required
        />
      </div>

      {/* Email */}
      <Input
        label="Email Address"
        type="email"
        value={formData?.email}
        onChange={(e) => handleInputChange('email', e.target.value)}
        placeholder="you@example.com"
        error={errors?.email}
        required
      />

      {/* Institution */}
      <Input
        label="Institution/Organization"
        type="text"
        value={formData?.institution}
        onChange={(e) => handleInputChange('institution', e.target.value)}
        placeholder="Your University or Company"
        error={errors?.institution}
        required
      />

      {/* Password */}
      <div className="relative">
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={formData?.password}
          onChange={(e) => handleInputChange('password', e.target.value)}
          placeholder="At least 8 characters with uppercase, lowercase, number, and special character"
          error={errors?.password}
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
        >
          {showPassword ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Confirm Password */}
      <div className="relative">
        <Input
          label="Confirm Password"
          type={showConfirmPassword ? 'text' : 'password'}
          value={formData?.confirmPassword}
          onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
          placeholder="Confirm your password"
          error={errors?.confirmPassword}
          required
        />
        <button
          type="button"
          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
        >
          {showConfirmPassword ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      <div className="text-sm text-muted-foreground">
        Create an account using Auth0 hosted signup or a social provider. We will collect any additional app-specific info after you sign in.
      </div>

      <div>
        <Button type="submit" fullWidth loading={isLoading}>
          Create Account
        </Button>
      </div>

    </form>
  );
};

export default SignupForm;
