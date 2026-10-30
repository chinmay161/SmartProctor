import React, { useState, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import SmartProctorLogo from '../../components/ui/SmartProctorLogo';
import ThemeToggle from '../../components/ui/ThemeToggle';
import AppFooter from '../../components/ui/AppFooter';
import NeonGridBackground from '../../components/ui/NeonGridBackground';
import { useSession } from '../../context/SessionContext';
import { useAuth0 } from '@auth0/auth0-react';

const DeviceTestModal = lazy(() => import('../../components/proctoring/DeviceTestModal'));

const LandingPage = () => {
  const [deviceTestOpen, setDeviceTestOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated: sessionAuth, profile, role } = useSession();
  const { isAuthenticated: auth0Auth } = useAuth0();

  const isAuthenticated = sessionAuth || auth0Auth;

  const getDashboardPath = () => {
    const userRole = profile?.role || role;
    if (userRole === 'admin') return '/admin-panel';
    if (userRole === 'teacher') return '/teacher-dashboard';
    return '/student-dashboard';
  };

  const features = [
    {
      title: 'Face & Focus Check',
      desc: 'Checks on your device that the student is in frame and facing the screen. Only still photos of flagged moments are kept; no continuous webcam video is recorded.',
      icon: 'Camera',
      tag: 'Presence',
    },
    {
      title: 'Background Voice Alert',
      desc: 'Flags continuous speech in the room so instructors can tell when help may be coming from outside. No audio is recorded.',
      icon: 'Mic',
      tag: 'Audio',
    },
    {
      title: 'Fullscreen & Focus Rules',
      desc: 'Requires fullscreen and flags tab switching, window changes, copy-paste attempts and leaving the exam page.',
      icon: 'Maximize',
      tag: 'Focus',
    },
    {
      title: 'Activity Timeline',
      desc: 'A step-by-step record of interruptions and flagged moments, so teachers can review attempts quickly.',
      icon: 'Clock',
      tag: 'Review',
    },
    {
      title: 'Built for Shaky Wi-Fi',
      desc: 'Answers are saved as you go and retried when the connection comes back.',
      icon: 'Wifi',
      tag: 'Reliability',
    },
    {
      title: 'Quick Device Test',
      desc: 'Check your webcam and microphone before exam day. The first run downloads the checking tools, so allow a minute or two on a slow connection.',
      icon: 'CheckCircle',
      tag: 'Readiness',
    },
  ];

  const steps = [
    {
      num: '01',
      title: 'Quick Setup & Device Check',
      desc: 'A guided check confirms camera, microphone and fullscreen before the exam starts, usually in under a minute.',
    },
    {
      num: '02',
      title: 'Focus on Your Test',
      desc: 'Take the exam with gentle reminders if you accidentally look away, switch tabs, or lose focus.',
    },
    {
      num: '03',
      title: 'Transparent Teacher Review',
      desc: 'Submissions include a clear timeline of events so teachers can verify issues fairly, without digging through hours of recordings.',
    },
  ];

  return (
    <div className="min-w-0 bg-background text-foreground flex flex-col font-sans transition-colors relative">
      <NeonGridBackground mode="viewport" />

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-background/80 border-b border-border transition-colors">
        <div className="h-[2px] w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex items-center justify-center p-1.5 rounded-xl bg-primary/10 border border-primary/20 shadow-sm transition-transform duration-200 group-hover:scale-105">
              <SmartProctorLogo size={28} />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">
              Smart<span className="text-primary">Proctor</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 bg-muted/60 p-1 rounded-full border border-border text-sm font-medium">
            <a
              href="#features"
              className="px-4 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-150"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="px-4 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-150"
            >
              How It Works
            </a>
            <button
              onClick={() => setDeviceTestOpen(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-150 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Device Check
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle floating={false} />
            {isAuthenticated ? (
              <button
                onClick={() => navigate(getDashboardPath())}
                className="px-4 py-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold shadow-sm transition-all cursor-pointer"
              >
                Go to Dashboard
              </button>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold shadow-sm transition-all"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            {/* Privacy Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6 backdrop-blur-sm shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Privacy-first • Checks run on your device • No continuous video or audio is recorded
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight text-foreground">
              Fair, Honest Online Exams,{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                Made Effortless
              </span>
            </h1>

            {/* User-Approved Subtitle */}
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              SmartProctor flags tab switching, phones held in view and background voices using checks that run on your own device, helping keep online tests fair.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => setDeviceTestOpen(true)}
                className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Icon name="Camera" size={18} />
                <span>Test My Device</span>
              </button>
              {isAuthenticated ? (
                <button
                  onClick={() => navigate(getDashboardPath())}
                  className="px-6 py-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold text-sm shadow-sm transition-all cursor-pointer"
                >
                  Go to Dashboard
                </button>
              ) : (
                <Link
                  to="/login"
                  className="px-6 py-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold text-sm shadow-sm transition-all"
                >
                  Sign In to Exam
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-16 sm:py-24 bg-muted/30 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Simple, Built-In Protections for Every Exam
              </h2>
              <p className="mt-4 text-muted-foreground">
                Transparent tools designed to keep testing honest, calm, and private for students and teachers alike.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feat, idx) => (
                <div
                  key={idx}
                  className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200 flex flex-col justify-between"
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
                    <h3 className="text-lg font-bold text-foreground">{feat.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                How It Works in 3 Easy Steps
              </h2>
              <p className="mt-4 text-muted-foreground">
                Fast for students to get started, effortless for teachers to manage.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, idx) => (
                <div key={idx} className="relative bg-card border border-border rounded-2xl p-6 text-center shadow-sm">
                  <div className="text-4xl font-extrabold text-primary/30 mb-2 font-mono">{step.num}</div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* AppFooter */}
      <AppFooter />

      {/* Logged-Out / Quick Device Test Modal */}
      {deviceTestOpen && (
        <Suspense fallback={null}>
          <DeviceTestModal onClose={() => setDeviceTestOpen(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default LandingPage;
