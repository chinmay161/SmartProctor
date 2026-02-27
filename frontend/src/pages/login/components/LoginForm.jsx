import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import authService from '../../../services/authService';
import { apiRequest } from '../../../services/api';
import { apiGet } from '../../../services/httpClient';
import { useNavigate, Link } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { dashboardForRoles, extractRolesFromAuth0User } from '../../../utils/roleUtils';

const LoginForm = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const { loginWithPopup, isLoading: auth0Loading, user: auth0User, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  // Real login will be handled by backend session endpoint

  const validateForm = () => {
    const newErrors = {};

    if (!formData?.email?.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/?.test(formData?.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData?.password) {
      newErrors.password = 'Password is required';
    } else if (formData?.password?.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
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

  const resolveDestinationWithFallback = async ({ includeAuth0ProfileFallback = false } = {}) => {
    const destinationFromProfile = (profile) => {
      const roles = Array.isArray(profile?.roles) && profile.roles.length > 0
        ? profile.roles
        : (profile?.role ? [profile.role] : []);
      return dashboardForRoles(roles);
    };

    const rolesFromClaim = extractRolesFromAuth0User(auth0User);
    if (rolesFromClaim.length > 0) {
      return dashboardForRoles(rolesFromClaim);
    }

    if (includeAuth0ProfileFallback) {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: { audience: auth0Audience },
        });
        const profile = await apiRequest('/profile/me', 'GET', null, token);
        const destination = destinationFromProfile(profile);
        if (destination !== '/login') {
          return destination;
        }
      } catch (err) {
        // Continue to non-Auth0 fallback.
      }
    }

    try {
      const profile = await apiGet('/profile/me');
      const destination = destinationFromProfile(profile);
      if (destination !== '/login') {
        return destination;
      }
    } catch (err) {
      // No fallback role source available.
    }

    return '/login';
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await authService.loginUser(formData.email, formData.password, false, null);
      const destination = await resolveDestinationWithFallback();
      if (destination === '/login') {
        setErrors({ submit: 'Role not available. Contact admin.' });
        return;
      }
      navigate(destination);
    } catch (error) {
      setErrors({ email: 'Invalid credentials or login failed', password: '' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoFactorSubmit = (e) => {
    e?.preventDefault();
    // If backend supports MFA this would be handled via additional endpoints
    setErrors({ twoFactor: 'Two-factor flow not implemented in this flow' });
    setIsLoading(false);
  };

  if (showTwoFactor) {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="Shield" size={32} color="var(--color-primary)" />
          </div>
          <h2 className="text-2xl md:text-3xl font-heading font-semibold text-foreground mb-2">
            Two-Factor Authentication
          </h2>
          <p className="text-sm md:text-base text-muted-foreground">
            Enter the 6-digit code sent to your registered device
          </p>
        </div>
        <form onSubmit={handleTwoFactorSubmit} className="space-y-6">
          <Input
            label="Verification Code"
            type="text"
            placeholder="Enter 6-digit code"
            value={twoFactorCode}
            onChange={(e) => {
              setTwoFactorCode(e?.target?.value);
              if (errors?.twoFactor) setErrors(prev => ({ ...prev, twoFactor: '' }));
            }}
            error={errors?.twoFactor}
            maxLength={6}
            required
          />

          <Button
            type="submit"
            variant="default"
            fullWidth
            loading={isLoading}
            iconName="CheckCircle"
            iconPosition="right"
          >
            Verify & Sign In
          </Button>

          <button
            type="button"
            onClick={() => {
              setShowTwoFactor(false);
              setTwoFactorCode('');
              setErrors({});
            }}
            className="w-full text-sm text-primary hover:text-primary/80 transition-smooth"
          >
            Back to login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      {/* Social login */}
      <div className="mb-4">
        <button
          type="button"
          onClick={async () => {
            try {
              setIsLoading(true);
              await loginWithPopup({
                connection: 'google-oauth2',
                screen_hint: 'login',
              });

              const destination = await resolveDestinationWithFallback({ includeAuth0ProfileFallback: true });
              if (destination === '/login') {
                setErrors({ submit: 'Role not available. Contact admin.' });
                return;
              }
              navigate(destination);
            } catch (error) {
              console.error('Google sign-in failed', error);
              setErrors({ submit: 'Google sign-in failed. Please try again.' });
            } finally {
              setIsLoading(false);
            }
          }}
          disabled={isLoading || auth0Loading}
          className="w-full px-4 py-2.5 border border-input hover:bg-accent hover:border-primary rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mb-4"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="font-medium text-sm">
            {isLoading || auth0Loading ? 'Signing in with Google...' : 'Sign in with Google'}
          </span>
        </button>
      </div>
      {errors?.submit && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
          <p className="text-sm text-red-700">{errors.submit}</p>
        </div>
      )}
      <div className="text-center mb-6 md:mb-8">
        <h1 className="text-3xl md:text-4xl font-heading font-semibold text-foreground mb-2">
          Welcome Back
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Sign in to access your exam proctoring dashboard
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
        <Input
          label="Email Address"
          type="email"
          placeholder="your.email@institution.edu"
          value={formData?.email}
          onChange={(e) => handleInputChange('email', e?.target?.value)}
          error={errors?.email}
          required
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            value={formData?.password}
            onChange={(e) => handleInputChange('password', e?.target?.value)}
            error={errors?.password}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-9 text-muted-foreground hover:text-foreground transition-smooth"
          >
            <Icon name={showPassword ? 'EyeOff' : 'Eye'} size={20} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <Checkbox
            label="Remember me"
            checked={formData?.rememberMe}
            onChange={(e) => handleInputChange('rememberMe', e?.target?.checked)}
          />
          <button
            type="button"
            className="text-sm text-primary hover:text-primary/80 transition-smooth"
          >
            Forgot Password?
          </button>
        </div>

        <Button
          type="submit"
          variant="default"
          fullWidth
          loading={isLoading}
          iconName="LogIn"
          iconPosition="right"
        >
          Sign In
        </Button>
      </form>
      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link 
            to="/signup" 
            className="text-primary hover:text-primary/80 transition-smooth font-medium"
          >
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginForm;
