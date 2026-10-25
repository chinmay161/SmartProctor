import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import ThemeToggle from '../../components/ui/ThemeToggle';
import SmartProctorLogo from '../../components/ui/SmartProctorLogo';
import AppFooter from '../../components/ui/AppFooter';

import { useAuthRoles } from '../../utils/useAuthRoles';
import { dashboardForRoles } from '../../utils/roleUtils';

const DeviceTestModal = lazy(() => import('../../components/proctoring/DeviceTestModal'));

const LandingPage = () => {
  const navigate = useNavigate();
  const { effectiveIsAuthenticated, effectiveRoles, hasResolvedRoles } = useAuthRoles();
  const [deviceTestOpen, setDeviceTestOpen] = useState(false);

  useEffect(() => {
    document.title = 'SmartProctor — Simple & Honest Online Exam Proctoring';
  }, []);

  useEffect(() => {
    if (effectiveIsAuthenticated && hasResolvedRoles) {
      const rolePath = dashboardForRoles(effectiveRoles);
      if (rolePath && rolePath !== '/login') {
        navigate(rolePath, { replace: true });
      }
    }
  }, [effectiveIsAuthenticated, hasResolvedRoles, effectiveRoles, navigate]);

  const handlePortalClick = (targetRole) => {
    if (effectiveIsAuthenticated) {
      const rolePath = dashboardForRoles(effectiveRoles);
      navigate(rolePath);
    } else {
      navigate(targetRole ? `/login?role=${targetRole}` : '/login');
    }
  };

  const features = [
    {
      icon: 'ScanFace',
      title: 'Face & Focus Check',
      desc: 'Gently checks that the student is facing the screen throughout the test, without streaming or storing any personal webcam video.',
      tag: 'Focus & Gaze',
    },
    {
      icon: 'Mic',
      title: 'Background Voice Alert',
      desc: 'Catches voices, whispers, or outside coaching in the room so instructors know students are answering independently.',
      tag: 'Sound Check',
    },
    {
      icon: 'ShieldCheck',
      title: 'Screen & Tab Lock',
      desc: 'Keeps students focused on their test by preventing new browser tabs, copy-pasting answers, Google searches, or second monitors.',
      tag: 'Zero Distractions',
    },
    {
      icon: 'Activity',
      title: 'Simple Activity Timeline',
      desc: 'Creates a clear, step-by-step summary of any interruptions or tab switches so teachers can review tests in seconds.',
      tag: 'Clear Logs',
    },
    {
      icon: 'Wifi',
      title: 'Safe Against Wi-Fi Drops',
      desc: 'If a student’s internet flickers or disconnects, their answers are saved safely so they never lose any progress.',
      tag: 'Auto-Save',
    },
    {
      icon: 'Terminal',
      title: 'Quick Device Test',
      desc: 'Students can test their webcam and microphone in 30 seconds before testing, avoiding any technical stress on exam day.',
      tag: 'Easy Setup',
    },
  ];

  const steps = [
    {
      num: '01',
      title: 'Quick 30-Second Check',
      desc: 'A quick guided check confirms your camera, microphone, and full screen are ready before test time.',
    },
    {
      num: '02',
      title: 'Take Your Exam in Peace',
      desc: 'Work through questions with a clean, clear timer while answers save automatically with every click.',
    },
    {
      num: '03',
      title: 'Instant Results & Feedback',
      desc: 'Submit your test and see your provisional score right away if enabled by your instructor.',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors duration-300 relative overflow-x-hidden">
      {/* AWS-style Cosmic Aurora Gradient Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        {/* Top Centered Hero Bloom */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-[110vw] max-w-[1300px] h-[550px] pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 65% 55% at 50% 20%, rgba(37, 99, 235, 0.25) 0%, rgba(6, 182, 212, 0.14) 35%, rgba(79, 70, 229, 0.06) 65%, transparent 100%)`,
          }}
        />

        {/* Left Upper Indigo Atmospheric Glow */}
        <div
          className="absolute -top-20 -left-36 w-[550px] h-[550px] rounded-full blur-[130px] pointer-events-none opacity-45 dark:opacity-60"
          style={{ background: 'rgba(79, 70, 229, 0.35)' }}
        />

        {/* Right Upper Cyan Atmospheric Glow */}
        <div
          className="absolute top-16 -right-36 w-[500px] h-[500px] rounded-full blur-[130px] pointer-events-none opacity-35 dark:opacity-50"
          style={{ background: 'rgba(6, 182, 212, 0.28)' }}
        />

        {/* Mid-Page Ambient Soft Sapphire Radiance */}
        <div
          className="absolute top-[48%] left-1/2 -translate-x-1/2 w-[850px] h-[450px] rounded-full blur-[150px] pointer-events-none opacity-25 dark:opacity-35"
          style={{ background: 'rgba(37, 99, 235, 0.22)' }}
        />
      </div>

      {/* Top Navbar with distinct identity & elevation */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#070B14]/95 backdrop-blur-xl border-b border-slate-200/90 dark:border-slate-800/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)] transition-colors">
        {/* Cosmic Aurora hairline accent on top */}
        <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex items-center justify-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 shadow-sm transition-transform duration-200 group-hover:scale-105">
              <SmartProctorLogo size={32} />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Smart<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-400 dark:to-cyan-400">Proctor</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 dark:bg-slate-900/90 p-1 rounded-full border border-slate-200/90 dark:border-slate-800 text-sm font-medium shadow-inner">
            <a
              href="#features"
              className="px-4 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-all duration-150"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="px-4 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-all duration-150"
            >
              How It Works
            </a>
            <button
              onClick={() => setDeviceTestOpen(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-all duration-150"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Device Check
            </button>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle floating={false} />
            {effectiveIsAuthenticated ? (
              <button
                onClick={() => navigate(dashboardForRoles(effectiveRoles))}
                className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-md shadow-blue-500/20 hover:shadow-blue-500/35 transition-all"
              >
                Go to Dashboard
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-full text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-md shadow-blue-500/20 hover:shadow-blue-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 relative z-10">
        <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6 backdrop-blur-sm shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              🔒 100% Private • No Video Saved to the Cloud
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight sm:leading-none text-foreground drop-shadow-sm">
              Fair, Honest Online Exams,{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                Made Effortless
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-slate-700 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
              SmartProctor automatically checks for screen focus, unauthorized devices, and background voices right inside your browser — keeping tests fair without invading student privacy.
            </p>


          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-16 sm:py-24 bg-card/40 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight">Simple, Built-In Protections for Every Exam</h2>
              <p className="mt-4 text-muted-foreground">
                Smart tools designed to keep testing honest, calm, and private for students and teachers alike.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feat, idx) => (
                <div
                  key={idx}
                  className="bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:border-primary/40 transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Icon name={feat.icon} size={24} />
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                        {feat.tag}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold">{feat.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section id="how-it-works" className="py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight">How It Works in 3 Easy Steps</h2>
              <p className="mt-4 text-muted-foreground">
                Fast for students to get started, effortless for teachers to manage.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, idx) => (
                <div key={idx} className="relative bg-card border border-border rounded-2xl p-6 text-center">
                  <div className="text-4xl font-extrabold text-primary/30 mb-2">{step.num}</div>
                  <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <AppFooter />

      {/* Device Test Modal */}
      {deviceTestOpen && (
        <Suspense fallback={null}>
          <DeviceTestModal onClose={() => setDeviceTestOpen(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default LandingPage;
