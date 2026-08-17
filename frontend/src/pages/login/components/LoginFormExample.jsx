/**
 * Example Login Form with Session Management Integration
 * Shows how to use the session management hooks in a real component
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../context/SessionContext';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

const LoginFormExample = () => {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useSession();

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [localError, setLocalError] = useState(null);

  /**
   * Handle login form submission
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (!userId.trim()) {
      setLocalError('Please enter your user ID');
      return;
    }

    try {
      // In a real app, you would:
      // 1. Validate credentials with your auth provider (Auth0, etc.)
      // 2. Get authenticated user info
      // 3. Then create session in SmartProctor

      // Example: Validate credentials
      // const authToken = await validateCredentials(userId, password);

      // For now, we'll just use the userId
      // In production, pass the validated user ID from your auth provider

      const response = await login(userId, isMobile, deviceName);

      // Redirect based on role (you can customize this)
      // For now, redirect to student dashboard
      setTimeout(() => {
        navigate('/student-dashboard');
      }, 500);

    } catch (err) {
      setLocalError(
        err?.detail || 
        err?.message || 
        'Login failed. Please try again.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Welcome back
        </h1>
        <p className="text-muted-foreground">
          Sign in to your SmartProctor account
        </p>
      </div>

      {/* Error Messages */}
      {(error || localError) && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error || localError}
          {error && (
            <button
              onClick={clearError}
              className="ml-2 underline hover:no-underline"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        {/* User ID Input */}
        <div>
          <label htmlFor="userId" className="block text-sm font-medium text-foreground mb-1">
            User ID or Email
          </label>
          <Input
            id="userId"
            type="text"
            placeholder="Enter your user ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        {/* Password Input */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
            Password
          </label>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        {/* Device Info (Optional) */}
        <div className="space-y-3 pt-2 border-t border-border">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isMobile}
              onChange={(e) => setIsMobile(e.target.checked)}
              disabled={isLoading}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm text-foreground">
              This is a mobile device
            </span>
          </label>

          {!isMobile && (
            <div>
              <label htmlFor="deviceName" className="block text-xs text-muted-foreground mb-1">
                Device name (optional)
              </label>
              <Input
                id="deviceName"
                type="text"
                placeholder="e.g., Laptop, Office Computer"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                disabled={isLoading}
                size="sm"
              />
            </div>
          )}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={isLoading || !userId.trim()}
          className="w-full mt-6"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      {/* Additional Info */}
      <div className="text-center text-xs text-muted-foreground space-y-1 pt-4">
        <p>Your session will be secure and encrypted</p>
        <p>You'll be automatically logged out after 30 minutes of inactivity</p>
      </div>

      {/* Forgot Password / Sign Up Links */}
      <div className="flex justify-between text-sm">
        <a href="#" className="text-primary hover:underline">
          Forgot password?
        </a>
        <a href="#" className="text-primary hover:underline">
          Create account
        </a>
      </div>
    </div>
  );
};

export default LoginFormExample;
