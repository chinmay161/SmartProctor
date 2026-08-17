import React, { useEffect } from 'react';
import SignupForm from './components/SignupForm';
import SecurityBadgeDisplay from '../../components/ui/SecurityBadgeDisplay';

const Signup = () => {
  useEffect(() => {
    document.title = 'Sign Up - SmartProctor | Create Your Account';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        'content',
        'Create a SmartProctor account for secure online exam proctoring with AI-powered monitoring and comprehensive anti-cheating measures.'
      );
    }
  }, []);

  return (
    <>
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col lg:flex-row">
          {/* Left side - Features (hidden on mobile) */}
          <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/10 to-primary/5 p-12 flex-col justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-12">
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

              <div className="space-y-8">
                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">AI-Powered Monitoring</h3>
                    <p className="text-sm text-muted-foreground">Real-time detection of suspicious activities with advanced AI algorithms</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Secure & Encrypted</h3>
                    <p className="text-sm text-muted-foreground">Bank-level security with end-to-end encryption for all data</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Live Proctoring</h3>
                    <p className="text-sm text-muted-foreground">Connect with live proctors for additional exam support</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>Trusted by thousands of educators worldwide</p>
            </div>
          </div>

          {/* Right side - Form */}
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

              <SignupForm />
            </div>
          </div>
        </div>

        <SecurityBadgeDisplay variant="footer" />
      </div>
    </>
  );
};

export default Signup;
