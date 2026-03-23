import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useLogout } from '../../context/SessionContext';
import { useTheme } from '../../context/ThemeContext';
import SystemMetricsCard from './components/SystemMetricsCard';
import UserManagementTable from './components/UserManagementTable';
import SystemSettingsPanel from './components/SystemSettingsPanel';
import ReportsSection from './components/ReportsSection';
import SecurityMonitoring from './components/SecurityMonitoring';
import { apiRequest } from '../../services/api';
import { dashboardForRoles, extractRolesFromAuth0User } from '../../utils/roleUtils';

/* ─── Inline icon ─── */
const Ico = ({ d, size = 16, color }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d={d} />
  </svg>
);

const ICONS = {
  users:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  reports:  'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  shield:   'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout:   'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  plus:     'M12 4v16m8-8H4',
  bell:     'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  check:    'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warn:     'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  info:     'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  zap:      'M13 10V3L4 14h7v7l9-11h-7z',
  userPlus: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM20 8v6m3-3h-6',
  upload:   'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
  mail:     'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
};

const TABS = [
  { id: 'user-management', label: 'Users',    icon: ICONS.users    },
  { id: 'system-settings', label: 'Settings', icon: ICONS.settings  },
  { id: 'reports',         label: 'Reports',  icon: ICONS.reports   },
  { id: 'security',        label: 'Security', icon: ICONS.shield    },
];

const QUICK_ACTIONS = [
  { icon: ICONS.userPlus, label: 'Create User',          color: '#3B82F6' },
  { icon: ICONS.upload,   label: 'Bulk Import',          color: '#10B981' },
  { icon: ICONS.mail,     label: 'Broadcast Notification', color: '#F59E0B' },
  { icon: ICONS.download, label: 'Generate Report',      color: '#8B9BBE' },
  { icon: ICONS.settings, label: 'Configuration',        color: '#3B82F6' },
];

const NOTIFICATIONS = [
  { icon: ICONS.check, color: '#10B981', bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.2)', title: 'System Update Completed', body: 'Version 2.5.0 deployed successfully with new proctoring features', time: '2h ago' },
  { icon: ICONS.warn,  color: '#F59E0B', bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.2)',  title: 'High Violation Rate Detected', body: 'MIT institution showing 25% increase in violations this week',    time: '5h ago' },
  { icon: ICONS.info,  color: '#3B82F6', bg: 'rgba(59,130,246,0.07)',  border: 'rgba(59,130,246,0.2)',  title: 'Scheduled Maintenance',     body: 'System maintenance scheduled for Jan 25, 2026 at 2:00 AM EST',   time: '1d ago' },
];

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('user-management');
  const [accessChecking, setAccessChecking] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();
  const {
    getAccessTokenSilently,
    isAuthenticated: isAuth0Authenticated,
    user: auth0User,
    logout: auth0Logout,
  } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const { logout } = useLogout();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [systemMetrics] = useState([
    { title: 'Active Users',    value: '18,542', change: '+12.5%', changeType: 'positive', color: '#3B82F6', trend: [45,52,48,65,59,80,75] },
    { title: 'Concurrent Exams', value: '47',    change: '+8.3%',  changeType: 'positive', color: '#10B981', trend: [30,35,40,38,45,42,47] },
    { title: 'System Uptime',   value: '98.7%', change: '+0.5%',  changeType: 'positive', color: '#8B9BBE', trend: [95,96,97,96,98,97,98] },
    { title: 'Violations Today', value: '342',   change: '-15.2%', changeType: 'positive', color: '#F59E0B', trend: [60,55,50,45,40,38,35] },
  ]);

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      try {
        const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Audience } });
        await apiRequest('/admin/access-check', 'GET', null, token);
        if (!cancelled) { setAccessError(''); setAccessChecking(false); }
      } catch (err) {
        if (cancelled) return;
        const msg = String(err?.message || '');
        if (msg.includes('403') || msg.toLowerCase().includes('insufficient permissions')) {
          setAccessChecking(false);
          const roles = extractRolesFromAuth0User(auth0User);
          let redirect = dashboardForRoles(roles);
          if (redirect === '/login') {
            try {
              const token2 = await getAccessTokenSilently({ authorizationParams: { audience: auth0Audience } });
              const profile = await apiRequest('/profile/me', 'GET', null, token2);
              if (profile?.role) redirect = dashboardForRoles([profile.role]);
            } catch (_) {}
          }
          navigate(redirect, { replace: true }); return;
        }
        setAccessError('Failed to verify admin access. Please try again.');
        setAccessChecking(false);
      }
    };
    if (isLoggingOut) {
      setAccessChecking(false);
    } else if (isAuth0Authenticated) {
      verify();
    } else {
      setAccessChecking(false);
    }
    return () => { cancelled = true; };
  }, [auth0Audience, auth0User, getAccessTokenSilently, isAuth0Authenticated, isLoggingOut, navigate]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setAccessChecking(false);
    try {
      await logout(false);
    } catch (e) {
      console.error(e);
    } finally {
      auth0Logout({
        logoutParams: {
          returnTo: `${window.location.origin}/login`,
        },
      });
    }
  };

  /* ── Full-screen loading ── */
  if (accessChecking) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-background)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--sp-accent)', animation: 'spin 0.75s linear infinite' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-muted-foreground)' }}>Verifying admin access…</p>
      </div>
    );
  }

  if (accessError) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-background)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div className="sp-card" style={{ maxWidth: '400px', width: '100%', padding: '28px 24px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--sp-error)' }}>
            <Ico d={ICONS.shield} size={24} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--color-foreground)', marginBottom: '8px' }}>Access Denied</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.86rem', color: 'var(--color-muted-foreground)' }}>{accessError}</p>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'user-management': return <UserManagementTable />;
      case 'system-settings': return <SystemSettingsPanel />;
      case 'reports':         return <ReportsSection />;
      case 'security':        return <SecurityMonitoring />;
      default: return null;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)', transition: 'background 0.3s' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Glassmorphic Header ── */}
      <header className="sp-glass sp-fade-in" style={{ position: 'sticky', top: 0, zIndex: 50, padding: '0 clamp(1rem,4vw,2rem)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--sp-accent)" strokeWidth="2" width="18" height="18"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-foreground)', lineHeight: 1 }}>SmartProctor</p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-muted-foreground)', marginTop: '1px' }}>Admin Panel</p>
            </div>
          </div>

          {/* Desktop tab nav */}
          <nav style={{ display: 'flex', gap: '2px' }} className="hidden md:flex">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`sp-nav-item ${activeTab === t.id ? 'active' : ''}`}
                style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'var(--font-body)', fontSize: '0.83rem', fontWeight: activeTab === t.id ? 600 : 400, color: activeTab === t.id ? 'var(--sp-accent)' : 'var(--color-muted-foreground)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Ico d={t.icon} size={15} /> {t.label}
              </button>
            ))}
          </nav>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(59,130,246,0.08)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
              disabled={isLoggingOut}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sp-error)'; e.currentTarget.style.color = 'var(--sp-error)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted-foreground)'; }}
            >
              <Ico d={ICONS.logout} size={15} /> {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: 'clamp(1.5rem,4vw,2.5rem) clamp(1rem,4vw,2rem)' }}>

        {/* ── Hero zone ── */}
        <div className="sp-grid-bg sp-fade-up" style={{ borderRadius: '16px', padding: '24px 28px', border: '1px solid var(--color-border)', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '220px', height: '220px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.10) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem,3vw,2.2rem)', color: 'var(--color-foreground)', fontWeight: 400, marginBottom: '6px', lineHeight: 1.2 }}>Admin Panel</h1>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-muted-foreground)' }}>System-wide oversight and user management</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {[
                { icon: ICONS.download, label: 'Export Data', style: 'ghost' },
                { icon: ICONS.plus,     label: 'Add User',    style: 'primary' },
              ].map(({ icon, label, style }) => (
                <button
                  key={label}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '9px', fontFamily: 'var(--font-body)', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s', background: style === 'primary' ? 'var(--sp-accent)' : 'transparent', color: style === 'primary' ? '#fff' : 'var(--color-muted-foreground)', outline: style !== 'primary' ? '1px solid var(--color-border)' : 'none' }}
                  onMouseEnter={e => { if (style === 'primary') { e.currentTarget.style.background = 'var(--sp-accent-hover)'; e.currentTarget.style.boxShadow = '0 0 14px var(--sp-accent-glow)'; } else { e.currentTarget.style.color = 'var(--color-foreground)'; } }}
                  onMouseLeave={e => { if (style === 'primary') { e.currentTarget.style.background = 'var(--sp-accent)'; e.currentTarget.style.boxShadow = 'none'; } else { e.currentTarget.style.color = 'var(--color-muted-foreground)'; } }}
                >
                  <Ico d={icon} size={15} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Metrics grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '14px', marginBottom: '24px' }}>
          {systemMetrics.map((m, i) => <SystemMetricsCard key={i} {...m} delay={`${0.07 * i}s`} />)}
        </div>

        {/* ── Main content area ── */}
        <div className="sp-card sp-fade-up-3" style={{ overflow: 'hidden', marginBottom: '24px' }}>
          {/* Mobile tab row */}
          <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', overflowX: 'auto' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '13px 16px', display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-body)', fontSize: '0.83rem', fontWeight: activeTab === t.id ? 600 : 400,
                  color: activeTab === t.id ? 'var(--sp-accent)' : 'var(--color-muted-foreground)',
                  background: activeTab === t.id ? 'rgba(59,130,246,0.05)' : 'transparent',
                  borderBottom: activeTab === t.id ? '2px solid var(--sp-accent)' : '2px solid transparent',
                  border: 'none', borderLeft: 'none', borderRight: 'none', borderTop: 'none',
                  cursor: 'pointer', transition: 'all 0.2s', borderBottomStyle: 'solid',
                }}
              >
                <Ico d={t.icon} size={14} /> {t.label}
              </button>
            ))}
          </div>
          <div style={{ padding: '20px 24px' }}>
            {renderTabContent()}
          </div>
        </div>

        {/* ── Bottom grid: notifications + quick actions ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }} className="admin-bottom-grid">

          {/* Notifications */}
          <div className="sp-card sp-fade-up-5" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sp-accent)' }}>
                <Ico d={ICONS.bell} size={16} />
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-foreground)', fontWeight: 400 }}>System Notifications</h3>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.73rem', color: 'var(--color-muted-foreground)' }}>Recent system events and updates</p>
              </div>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {NOTIFICATIONS.map((n, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: '10px', background: n.bg, border: `1px solid ${n.border}`, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = n.color + '55'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = n.border}
                >
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: n.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: n.color }}>
                    <Ico d={n.icon} size={15} color={n.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.86rem', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '3px' }}>{n.title}</p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted-foreground)', marginBottom: '4px', lineHeight: 1.4 }}>{n.body}</p>
                    <p style={{ fontFamily: 'var(--font-data)', fontSize: '0.7rem', color: 'var(--color-muted-foreground)' }}>{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="sp-card sp-fade-up-6" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
                <Ico d={ICONS.zap} size={16} color="#F59E0B" />
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-foreground)', fontWeight: 400 }}>Quick Actions</h3>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.73rem', color: 'var(--color-muted-foreground)' }}>Common tasks</p>
              </div>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {QUICK_ACTIONS.map(({ icon, label, color }, i) => (
                <button
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '9px', background: 'var(--color-muted)', border: '1px solid var(--color-border)', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', width: '100%' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.background = color + '0D'; e.currentTarget.style.transform = 'translateX(3px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-muted)'; e.currentTarget.style.transform = 'translateX(0)'; }}
                >
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
                    <Ico d={icon} size={15} color={color} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', fontWeight: 500, color: 'var(--color-foreground)' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <style>{`.admin-bottom-grid { @media (max-width: 900px) { grid-template-columns: 1fr !important; } }`}</style>
      </main>
    </div>
  );
};

export default AdminPanel;
