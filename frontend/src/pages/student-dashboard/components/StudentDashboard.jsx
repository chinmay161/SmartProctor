import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useSession, useCurrentUser } from '../../../context/SessionContext';
import { authAwareCall } from '../../../services/authAwareCall';
import { sessionEvents } from '../../../services/tokenStorage';
import { useTheme } from '../../../context/ThemeContext';
import { formatIstDateTime } from '../../../utils/dateTime';

/* ─── Inline SVG icons (no extra dep) ─── */
const Icon = ({ d, d2, size = 20, cls = '' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    width={size}
    height={size}
    className={cls}
  >
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ICONS = {
  logout:    'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  exams:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  check:     'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  clock:     'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  trending:  'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  user:      'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  shield:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  play:      'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  calendar:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  warn:      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  close:     'M6 18L18 6M6 6l12 12',
  eye:       'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  barChart:  'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  moon:      'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  sun:       'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  refresh:   'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  id:        'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2',
};

/* ─── Stat card ─── */
const StatCard = ({ icon, label, value, color, delay }) => (
  <div
    className={`sp-card p-5 sp-count-up`}
    style={{ animationDelay: delay }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
      <div
        style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: color, flexShrink: 0,
        }}
      >
        <Icon d={icon} size={18} />
      </div>
    </div>
    <p style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-foreground)', lineHeight: 1, marginBottom: '6px' }}>
      {value ?? '—'}
    </p>
    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>
      {label}
    </p>
  </div>
);

/* ─── Status badge ─── */
const StatusBadge = ({ status }) => {
  const cfg = {
    submitted:   { bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6', label: 'Submitted'   },
    completed:   { bg: 'rgba(16,185,129,0.12)',  color: '#10B981', label: 'Completed'   },
    in_progress: { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B', label: 'In Progress' },
    available:   { bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6', label: 'Available'   },
    scheduled:   { bg: 'rgba(139,155,190,0.12)', color: '#8B9BBE', label: 'Scheduled'   },
    default:     { bg: 'rgba(139,155,190,0.12)', color: '#8B9BBE', label: status || 'Unknown' },
  };
  const c = cfg[status?.toLowerCase?.()] || cfg.default;
  return (
    <span
      className="sp-badge"
      style={{ background: c.bg, color: c.color }}
    >
      <span className="sp-pulse-dot" style={{ background: c.color }} />
      {c.label}
    </span>
  );
};

/* ─── Exam card ─── */
const ExamCard = ({ exam, nowTs, onStart, delay }) => {
  const startTime   = exam?.start_time ? new Date(exam.start_time) : null;
  const hasStart    = Boolean(startTime && !Number.isNaN(startTime.getTime()));
  const canStart    = !hasStart || nowTs >= startTime.getTime();
  const startLabel  = hasStart
    ? `${formatIstDateTime(exam.start_time, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })} IST`
    : 'Open access';
  const timeUntil   = hasStart && !canStart
    ? (() => {
        const d = startTime.getTime() - nowTs;
        const h = Math.floor(d / 3600000);
        const m = Math.floor((d % 3600000) / 60000);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      })()
    : null;

  return (
    <div
      className="sp-card sp-fade-up"
      style={{ padding: '20px 24px', animationDelay: delay, position: 'relative', overflow: 'hidden' }}
    >
      {/* Accent edge */}
      <div style={{
        position: 'absolute', left: 0, top: '20%', bottom: '20%',
        width: '3px', borderRadius: '0 3px 3px 0',
        background: canStart ? 'var(--sp-accent)' : 'var(--color-border)',
        transition: 'background 0.3s',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-foreground)', marginBottom: '4px', lineHeight: 1.25 }}>
            {exam.title}
          </h3>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>
            {exam.description || 'No description available'}
          </p>
        </div>
        <StatusBadge status={canStart ? 'available' : 'scheduled'} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', marginBottom: '18px' }}>
        {[
          { icon: ICONS.clock,    label: exam.duration_minutes ? `${exam.duration_minutes} min` : 'No limit' },
          { icon: ICONS.calendar, label: startLabel },
          { icon: ICONS.id,       label: exam.id?.toString().slice(0, 8) },
        ].map(({ icon, label }, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-muted-foreground)' }}>
            <Icon d={icon} size={14} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>{label}</span>
          </div>
        ))}
      </div>

      {timeUntil && (
        <div style={{
          padding: '8px 14px', borderRadius: '8px', background: 'rgba(59,130,246,0.07)',
          border: '1px solid rgba(59,130,246,0.15)', marginBottom: '14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted-foreground)' }}>Starts in</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--sp-accent)', fontWeight: 600 }}>{timeUntil}</span>
        </div>
      )}

      <button
        onClick={onStart}
        disabled={!canStart}
        style={{
          width: '100%', padding: '10px',
          borderRadius: '9px',
          background: canStart ? 'var(--sp-accent)' : 'var(--color-muted)',
          color: canStart ? '#fff' : 'var(--color-muted-foreground)',
          fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 600,
          border: 'none', cursor: canStart ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s, transform 0.15s, box-shadow 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
        onMouseEnter={e => { if (canStart) { e.currentTarget.style.background = 'var(--sp-accent-hover)'; e.currentTarget.style.boxShadow = '0 0 18px var(--sp-accent-glow)'; e.currentTarget.style.transform = 'scale(1.01)'; } }}
        onMouseLeave={e => { e.currentTarget.style.background = canStart ? 'var(--sp-accent)' : 'var(--color-muted)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <Icon d={ICONS.play} size={15} />
        {canStart ? 'Begin Exam' : 'Not Yet Available'}
      </button>
    </div>
  );
};

/* ─── History row ─── */
const HistoryRow = ({ item, onViewResult, index }) => {
  const date = item?.submitted_at
    ? new Date(item.submitted_at).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const score = `${item?.score ?? '—'} / ${item?.out_of ?? 0}`;

  return (
    <tr
      className="sp-fade-up"
      style={{
        borderBottom: '1px solid var(--color-border)',
        transition: 'background 0.18s',
        animationDelay: `${0.05 * index}s`,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '14px 16px' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '2px' }}>
          {item.exam_title}
        </p>
      </td>
      <td style={{ padding: '14px 16px' }}>
        <StatusBadge status={item.attempt_status} />
      </td>
      <td style={{ padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted-foreground)' }}>
        {date}
      </td>
      <td style={{ padding: '14px 16px', fontFamily: 'var(--font-data)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-foreground)' }}>
        {score}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
        <button
          onClick={() => onViewResult(item)}
          disabled={!item?.can_view_result}
          style={{
            padding: '6px 14px', borderRadius: '7px',
            background: item?.can_view_result ? 'rgba(59,130,246,0.1)' : 'transparent',
            border: `1px solid ${item?.can_view_result ? 'rgba(59,130,246,0.3)' : 'var(--color-border)'}`,
            color: item?.can_view_result ? 'var(--sp-accent)' : 'var(--color-muted-foreground)',
            fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600,
            cursor: item?.can_view_result ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s, border-color 0.15s',
            display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}
        >
          <Icon d={ICONS.eye} size={13} />
          View
        </button>
      </td>
    </tr>
  );
};

/* ─── Main Dashboard ─── */
const StudentDashboardExample = () => {
  const navigate = useNavigate();
  const { logout, getTokenTimeRemaining, sessionId } = useSession();
  const { user } = useCurrentUser();
  const { resolvedTheme, setTheme } = useTheme();
  const { user: auth0User, isAuthenticated: auth0Authenticated, logout: auth0Logout, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const isDark = resolvedTheme === 'dark';

  const [exams, setExams] = useState([]);
  const [examHistory, setExamHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [historyStatus, setHistoryStatus] = useState('');
  const [tokenWarning, setTokenWarning] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const [activeTab, setActiveTab] = useState('exams'); // 'exams' | 'history' | 'account'

  const callApi = useCallback((path, method = 'GET', body = null) =>
    authAwareCall({ path, method, body, auth0Authenticated, getAccessTokenSilently, auth0Audience, fallbackPaths: [] }),
    [auth0Authenticated, getAccessTokenSilently, auth0Audience]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true); setLoadingHistory(true); setError(null); setHistoryError(null);
        const [avail, hist] = await Promise.all([callApi('/exams/available'), callApi('/attempts/history')]);
        setExams(Array.isArray(avail) ? avail : avail?.exams || []);
        setExamHistory(Array.isArray(hist) ? hist : []);
      } catch (err) {
        setError(err?.detail || err?.message || 'Failed to load dashboard data');
      } finally { setLoading(false); setLoadingHistory(false); }
    };
    load();
  }, []);

  useEffect(() => {
    const check = () => {
      const t = getTokenTimeRemaining();
      setTokenWarning(t && t < 300 && t > 0);
    };
    const iv = setInterval(check, 30000);
    check();
    const onExpired = () => setError('Session expired. Please log in again.');
    sessionEvents.on('sessionExpired', onExpired);
    return () => { clearInterval(iv); sessionEvents.off('sessionExpired', onExpired); };
  }, [getTokenTimeRemaining]);

  useEffect(() => {
    const iv = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  const handleLogout = async () => {
    try {
      await logout(false);
      if (auth0Authenticated) { auth0Logout({ logoutParams: { returnTo: `${window.location.origin}/login` } }); return; }
      navigate('/login');
    } catch { setError('Logout failed. Please try again.'); }
  };

  const handleStartExam = async (examId) => {
    try {
      const r = await callApi(`/sessions/${examId}/start`, 'POST');
      const sid = r?.session_id || r?.id;
      navigate(`/exam-portal?examId=${encodeURIComponent(examId)}${sid ? `&sessionId=${encodeURIComponent(sid)}` : ''}`);
    } catch (err) { setError(err?.detail || err?.message || 'Failed to start exam'); }
  };

  const handleViewResult = async (item) => {
    setHistoryStatus(''); setHistoryError(null);
    if (!item?.can_view_result) { setHistoryError('Result not declared yet.'); return; }
    navigate(`/student-dashboard/results/${encodeURIComponent(item.exam_id)}`);
  };

  const displayName = auth0User?.name || auth0User?.nickname || user?.name || 'Student';
  const minRemaining = Math.floor((getTokenTimeRemaining() || 0) / 60);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%',
            border: '3px solid var(--color-border)', borderTopColor: 'var(--sp-accent)',
            animation: 'spin 0.75s linear infinite', margin: '0 auto 16px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--color-muted-foreground)' }}>Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  /* ── Stats for header cards ── */
  const stats = [
    { icon: ICONS.exams,   label: 'Available Exams',  value: exams.length,              color: '#3B82F6', delay: '0.05s' },
    { icon: ICONS.check,   label: 'Completed',         value: examHistory.length,         color: '#10B981', delay: '0.12s' },
    { icon: ICONS.clock,   label: 'Session (min)',      value: minRemaining,               color: '#F59E0B', delay: '0.19s' },
    { icon: ICONS.shield,  label: 'Security',           value: 'Active',                   color: '#3B82F6', delay: '0.26s' },
  ];

  const tabs = [
    { id: 'exams',   label: 'Exams',       icon: ICONS.exams   },
    { id: 'history', label: 'History',     icon: ICONS.barChart },
    { id: 'account', label: 'Account',     icon: ICONS.user     },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)', transition: 'background 0.3s, color 0.3s' }}>

      {/* ── Sticky Glassmorphic Header ── */}
      <header
        className="sp-glass sp-fade-in"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          padding: '0 clamp(1rem, 4vw, 2rem)',
          transition: 'background 0.3s',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          {/* Logo + greeting */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '9px',
              background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--sp-accent)" strokeWidth="2" width="18" height="18">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-foreground)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                SmartProctor
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-muted-foreground)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Welcome back, <strong style={{ color: 'var(--sp-accent)' }}>{displayName}</strong>
              </p>
            </div>
          </div>

          {/* Nav tabs (desktop) */}
          <nav style={{ display: 'flex', gap: '4px' }} className="hidden md:flex">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`sp-nav-item ${activeTab === t.id ? 'active' : ''}`}
                style={{
                  padding: '6px 14px',
                  fontFamily: 'var(--font-body)', fontSize: '0.83rem', fontWeight: activeTab === t.id ? 600 : 400,
                  color: activeTab === t.id ? 'var(--sp-accent)' : 'var(--color-muted-foreground)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '7px',
                }}
              >
                <Icon d={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* Theme toggle */}
            <button
              id="dashboard-theme-toggle"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title={isDark ? 'Switch to Light' : 'Switch to Dark'}
              style={{
                width: '34px', height: '34px', borderRadius: '8px',
                background: 'rgba(59,130,246,0.08)', border: '1px solid var(--color-border)',
                color: 'var(--color-muted-foreground)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.2s, background 0.2s',
                fontSize: '14px',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sp-accent)'; e.currentTarget.style.background = 'rgba(59,130,246,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; }}
            >
              {isDark ? '☀️' : '🌙'}
            </button>

            {/* Logout */}
            <button
              id="dashboard-logout-btn"
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px',
                background: 'transparent', border: '1px solid var(--color-border)',
                color: 'var(--color-muted-foreground)',
                fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sp-error)'; e.currentTarget.style.color = 'var(--sp-error)'; e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted-foreground)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon d={ICONS.logout} size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: 'clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem)' }}>

        {/* ── Hero zone ── */}
        <div
          className="sp-grid-bg sp-fade-up"
          style={{
            borderRadius: '16px',
            padding: '28px 28px 24px',
            border: '1px solid var(--color-border)',
            marginBottom: '28px',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Radial glow */}
          <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '260px', height: '260px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ marginBottom: '20px', position: 'relative', zIndex: 1 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'var(--color-foreground)', fontWeight: 400, marginBottom: '6px', lineHeight: 1.2 }}>
              Student Dashboard
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-muted-foreground)' }}>
              Session <code style={{ fontFamily: 'var(--font-data)', fontSize: '0.78rem', background: 'var(--color-muted)', padding: '1px 6px', borderRadius: '4px' }}>{sessionId?.slice(0, 10)}…</code>
              &nbsp;· expires in <strong style={{ color: minRemaining < 10 ? 'var(--sp-warning)' : 'var(--color-foreground)' }}>{minRemaining} min</strong>
            </p>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', position: 'relative', zIndex: 1 }}>
            {stats.map((s, i) => <StatCard key={i} {...s} />)}
          </div>
        </div>

        {/* ── Banners ── */}
        {tokenWarning && (
          <div className="sp-scale-in" style={{ marginBottom: '16px', padding: '14px 18px', borderRadius: '10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon d={ICONS.warn} size={18} cls="text-warning" style={{ color: 'var(--sp-warning)', flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--sp-warning)', marginBottom: '2px' }}>Session expiring soon</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted-foreground)' }}>Your session expires in {minRemaining} min. Save your work.</p>
              </div>
            </div>
            <button onClick={() => window.location.reload()} style={{ padding: '6px 14px', borderRadius: '7px', background: 'var(--sp-warning)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <Icon d={ICONS.refresh} size={13} /> Refresh
            </button>
          </div>
        )}

        {error && (
          <div className="sp-scale-in" style={{ marginBottom: '16px', padding: '14px 18px', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--sp-error)' }}>{error}</p>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'var(--color-muted-foreground)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
              <Icon d={ICONS.close} size={16} />
            </button>
          </div>
        )}

        {historyStatus && (
          <div className="sp-scale-in" style={{ marginBottom: '16px', padding: '14px 18px', borderRadius: '10px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--sp-success)', fontWeight: 500 }}>{historyStatus}</p>
          </div>
        )}

        {historyError && (
          <div className="sp-scale-in" style={{ marginBottom: '16px', padding: '14px 18px', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--sp-error)' }}>{historyError}</p>
            <button onClick={() => setHistoryError(null)} style={{ background: 'none', border: 'none', color: 'var(--color-muted-foreground)', cursor: 'pointer', display: 'flex' }}>
              <Icon d={ICONS.close} size={16} />
            </button>
          </div>
        )}

        {/* ── Mobile tab bar ── */}
        <div className="flex md:hidden" style={{ gap: '6px', marginBottom: '20px' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, padding: '9px 6px', borderRadius: '9px',
                background: activeTab === t.id ? 'rgba(59,130,246,0.12)' : 'var(--color-card)',
                border: `1px solid ${activeTab === t.id ? 'rgba(59,130,246,0.3)' : 'var(--color-border)'}`,
                color: activeTab === t.id ? 'var(--sp-accent)' : 'var(--color-muted-foreground)',
                fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: activeTab === t.id ? 600 : 400,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                transition: 'all 0.2s',
              }}
            >
              <Icon d={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}

        {/* EXAMS TAB */}
        {activeTab === 'exams' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--color-foreground)', fontWeight: 400 }}>
                Available Exams
                <span style={{ marginLeft: '10px', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted-foreground)', fontWeight: 400 }}>
                  {exams.length} exam{exams.length !== 1 ? 's' : ''}
                </span>
              </h2>
            </div>

            {exams.length === 0 ? (
              <div className="sp-card sp-fade-up" style={{ padding: '56px 24px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--sp-accent)' }}>
                  <Icon d={ICONS.exams} size={24} />
                </div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-foreground)', marginBottom: '6px' }}>No exams available</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--color-muted-foreground)' }}>Check back later or contact your instructor.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                {exams.map((exam, i) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    nowTs={nowTs}
                    onStart={() => handleStartExam(exam.id)}
                    delay={`${0.07 * i}s`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--color-foreground)', fontWeight: 400, marginBottom: '16px' }}>
              Exam History
            </h2>

            {loadingHistory ? (
              <div className="sp-card sp-fade-up" style={{ padding: '48px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-muted-foreground)' }}>Loading history…</p>
              </div>
            ) : examHistory.length === 0 ? (
              <div className="sp-card sp-fade-up" style={{ padding: '56px 24px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--sp-accent)' }}>
                  <Icon d={ICONS.barChart} size={24} />
                </div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-foreground)', marginBottom: '6px' }}>No completed exams yet</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--color-muted-foreground)' }}>Your exam results will appear here after you submit.</p>
              </div>
            ) : (
              <div className="sp-card sp-scale-in" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-muted)' }}>
                        {['Exam', 'Status', 'Submitted', 'Score', 'Action'].map((h, i) => (
                          <th
                            key={h}
                            style={{
                              padding: '11px 16px',
                              textAlign: i === 4 ? 'right' : 'left',
                              fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600,
                              color: 'var(--color-muted-foreground)', letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {examHistory.map((item, i) => (
                        <HistoryRow key={`${item.exam_id}-${i}`} item={item} onViewResult={handleViewResult} index={i} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACCOUNT TAB */}
        {activeTab === 'account' && (
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--color-foreground)', fontWeight: 400, marginBottom: '16px' }}>
              Your Account
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {/* Profile card */}
              <div className="sp-card sp-fade-up-1" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <div style={{
                    width: '52px', height: '52px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(59,130,246,0.1))',
                    border: '2px solid rgba(59,130,246,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--sp-accent)', fontSize: '1.4rem', fontFamily: 'var(--font-display)',
                    flexShrink: 0,
                  }}>
                    {displayName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-foreground)', marginBottom: '3px' }}>{displayName}</p>
                    <StatusBadge status="active" />
                  </div>
                </div>
                {[
                  { label: 'Email',    value: auth0User?.email || user?.email || '—' },
                  { label: 'Role',     value: user?.roles?.join(', ') || 'student' },
                  { label: 'User ID',  value: (auth0User?.sub || user?.id || '—')?.toString()?.slice(0, 16) },
                  { label: 'Session',  value: sessionId?.slice(0, 14) + '…' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontFamily: label === 'User ID' || label === 'Session' ? 'var(--font-data)' : 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-foreground)', fontWeight: 500, maxWidth: '200px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Security card */}
              <div className="sp-card sp-fade-up-2" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sp-success)', flexShrink: 0 }}>
                    <Icon d={ICONS.shield} size={18} />
                  </div>
                  <div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.92rem', fontWeight: 600, color: 'var(--color-foreground)' }}>Security Status</p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted-foreground)' }}>Auth0 secured session</p>
                  </div>
                </div>
                {[
                  { label: 'Authentication', status: '✓ Auth0 via OAuth2', ok: true },
                  { label: 'Session Token',  status: `Valid · ${minRemaining}m left`,  ok: minRemaining > 5 },
                  { label: 'Exam Integrity', status: '✓ Proctoring active', ok: true  },
                  { label: 'Data Encrypted', status: '✓ TLS 1.3',           ok: true  },
                ].map(({ label, status, ok }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: ok ? 'var(--sp-success)' : 'var(--sp-warning)', fontWeight: 600 }}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentDashboardExample;
