import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SmartProctorLogo from './SmartProctorLogo';
import { useSession } from '../../context/SessionContext';

const DeviceTestModal = lazy(() => import('../proctoring/DeviceTestModal'));

const AppFooter = ({ className = '' }) => {
  const [deviceTestOpen, setDeviceTestOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  const { isAuthenticated, profile } = useSession();
  const navigate = useNavigate();

  // Live time ticker (IST & Local)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }) + ' IST'
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const getDashboardPath = () => {
    const role = profile?.role;
    if (role === 'admin') return '/admin-panel';
    if (role === 'teacher') return '/teacher-dashboard';
    return '/student-dashboard';
  };

  return (
    <>
      <footer className={`w-full mt-auto bg-black text-slate-400 border-t border-neutral-900 py-4 sm:py-5 text-sm relative z-20 ${className}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Left: Brand, Copyright & Clock */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <SmartProctorLogo size={20} />
              <span className="text-slate-400 font-medium">
                &copy; {new Date().getFullYear()} SmartProctor. All rights reserved.
              </span>
            </div>
            {currentTime && (
              <>
                <span className="hidden sm:inline text-neutral-800">•</span>
                <span className="text-[11px] font-mono text-slate-500 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-900" title="Synchronized Indian Standard Time (Exam Clock)">
                  {currentTime}
                </span>
              </>
            )}
          </div>

          {/* Right: Controls (Device Check, Shortcuts, Navigation) */}
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-5 text-xs sm:text-sm text-slate-400">
            <button
              type="button"
              onClick={() => setDeviceTestOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
              title="Test Camera, Microphone, and System Compatibility"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>Device Check</span>
            </button>

            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
              title="View Keyboard Shortcuts"
            >
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10px] font-mono text-slate-400">
                ?
              </kbd>
              <span>Shortcuts</span>
            </button>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => navigate(getDashboardPath())}
                className="hover:text-white transition-colors cursor-pointer font-medium text-slate-300"
              >
                Dashboard
              </button>
            ) : (
              <Link to="/login" className="hover:text-white transition-colors">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </footer>

      {/* Device Test Modal */}
      {deviceTestOpen && (
        <Suspense fallback={null}>
          <DeviceTestModal onClose={() => setDeviceTestOpen(false)} />
        </Suspense>
      )}

      {/* Keyboard Shortcuts Modal */}
      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-5 text-slate-300 text-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-xs font-mono text-white">
                  ⌘ / Ctrl
                </kbd>
                <h3 className="font-semibold text-white">Exam Hotkeys</h3>
              </div>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="text-slate-500 hover:text-white text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">Toggle Fullscreen Exam Mode</span>
                <kbd className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-slate-200">
                  F11
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">Close Modals / Popups</span>
                <kbd className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-slate-200">
                  Esc
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">Next Question Navigation</span>
                <kbd className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-slate-200">
                  Tab
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">Previous Question Navigation</span>
                <kbd className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-slate-200">
                  Shift + Tab
                </kbd>
              </div>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="w-full py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs text-white font-medium transition cursor-pointer border border-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AppFooter;
