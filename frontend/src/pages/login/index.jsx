import React, { useEffect } from 'react';
import LoginForm from './components/LoginForm';
import TrustSignals from './components/TrustSignals';
import FeatureHighlights from './components/FeatureHighlights';
import SecurityBadgeDisplay from '../../components/ui/SecurityBadgeDisplay';

const Login = () => {
  useEffect(() => {
    document.title = 'Login - SmartProctor | Secure Online Exam Proctoring';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        'content',
        'Sign in to SmartProctor for secure online exam proctoring with real-time monitoring and comprehensive anti-cheating measures.'
      );
    }
  }, []);

  return (
    <>
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col lg:flex-row">
          <FeatureHighlights />

          <div className="flex-1 flex items-center justify-center p-6 md:p-8 lg:p-12">
            <div className="w-full max-w-md">
              <div className="lg:hidden text-center mb-6">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                    <svg className="w-7 h-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                      <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-heading font-semibold text-foreground">
                    SmartProctor
                  </h2>
                </div>
              </div>

              <LoginForm />
              <TrustSignals />
            </div>
          </div>
        </div>

        <SecurityBadgeDisplay variant="footer" />
      </div>
    </>
  );
};

export default Login;
