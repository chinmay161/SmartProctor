import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useLogout } from '../../context/SessionContext';
import { useTheme } from '../../context/ThemeContext';
import SystemMetricsCard from './components/SystemMetricsCard';
import UserManagementTable from './components/UserManagementTable';
import SystemSettingsPanel from './components/SystemSettingsPanel';
import ReportsSection from './components/ReportsSection';
import SecurityMonitoring from './components/SecurityMonitoring';
import ProblemReportsTab from './components/ProblemReportsTab';
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
  refresh:  'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  warn:     'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
};

const TABS = [
  { id: 'user-management', label: 'Users',           icon: ICONS.users    },
  { id: 'problem-reports', label: 'Problem Reports', icon: ICONS.warn     },
  { id: 'system-settings', label: 'Settings',        icon: ICONS.settings },
  { id: 'reports',         label: 'Reports',         icon: ICONS.reports  },
  { id: 'security',        label: 'Security',        icon: ICONS.shield   },
];

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('user-management');
  const [accessChecking, setAccessChecking] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Real stats state
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  const navigate = useNavigate();
  const {
    getAccessTokenSilently,
    isAuthenticated: isAuth0Authenticated,
    user: auth0User,
  } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const { logout } = useLogout();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Audience } });
      const data = await apiRequest('/admin/stats', 'GET', null, token);
      setStats(data);
    } catch (err) {
      setStatsError(err);
    } finally {
      setStatsLoading(false);
    }
  }, [auth0Audience, getAccessTokenSilently]);

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      try {
        const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Audience } });
        await apiRequest('/admin/access-check', 'GET', null, token);
        if (!cancelled) {
          setAccessError('');
          setAccessChecking(false);
          fetchStats();
        }
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
          navigate(redirect, { replace: true });
          return;
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
  }, [auth0Audience, auth0User, fetchStats, getAccessTokenSilently, isAuth0Authenticated, isLoggingOut, navigate]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setAccessChecking(false);
    logout();
  };

  const handleExportData = async () => {
    setIsExporting(true);
    setExportError('');
    try {
      const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Audience } });
      const rawApiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
      const url = `${rawApiBase.replace(/\/+$/, '')}/admin/users/export?format=csv`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const reqId = res.headers.get('x-request-id') || 'unknown';
        throw new Error(`Export failed (${res.status}) [request id: ${reqId}]`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'users_export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setExportError(err?.message || 'Failed to export users data');
    } finally {
      setIsExporting(false);
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
      case 'problem-reports': return <ProblemReportsTab />;
      case 'system-settings': return <SystemSettingsPanel />;
      case 'reports':         return <ReportsSection />;
      case 'security':        return <SecurityMonitoring />;
      default: return null;
    }
  };

  const rolesBreakdown = stats?.registered_users?.roles || {};
  const userSubtitle = stats?.registered_users
    ? `${rolesBreakdown.student || 0} students · ${rolesBreakdown.teacher || 0} teachers · ${rolesBreakdown.admin || 0} admins`
    : 'User accounts';

  const sessionsSubtitle = stats
    ? `${stats.active_exams ?? 0} active exams in window`
    : 'Current activity';

  const violationsSubtitle = stats?.violations_today !== null && stats?.violations_today !== undefined
    ? 'Since 00:00 IST (Asia/Kolkata)'
    : 'Today';

  const serverStatusLabel = stats?.server?.database_ok ? 'Operational' : 'Degraded';
  const serverSubtitle = stats?.server
    ? `Storage: ${stats.server.evidence_storage_mode} · Env: ${stats.server.environment}`
    : 'System health';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)', transition: 'background 0.3s' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Glassmorphic Header ── */}
      <header className="sp-glass sp-fade-in" style={{ position: 'sticky', top: 0, zIndex: 50, padding: '0 clamp(1rem,4vw,2rem)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          {/* Brand header with route / */}
          <Link
            to="/"
            style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', cursor: 'pointer' }}
          >
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-foreground)', fontWeight: 600, lineHeight: 1 }}>SmartProctor</p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-muted-foreground)', marginTop: '2px' }}>Admin Panel</p>
            </div>
          </Link>

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
              title="Toggle theme"
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
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleExportData}
                disabled={isExporting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '9px',
                  fontFamily: 'var(--font-body)', fontSize: '0.83rem', fontWeight: 600, cursor: isExporting ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-foreground)',
                  transition: 'all 0.2s', opacity: isExporting ? 0.7 : 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sp-accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                data-testid="export-data-btn"
              >
                <Ico d={ICONS.download} size={15} /> {isExporting ? 'Exporting...' : 'Export Data'}
              </button>
            </div>
          </div>
          {exportError && (
            <div style={{ marginTop: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--sp-error)', fontSize: '0.8rem' }}>
              {exportError}
            </div>
          )}
        </div>

        {/* ── Stats Error State with Retry and Request ID ── */}
        {statsError && !statsLoading && (
          <div
            className="sp-card"
            style={{ padding: '16px 20px', marginBottom: '24px', borderLeft: '4px solid var(--sp-error)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}
            data-testid="stats-error-banner"
          >
            <div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.86rem', color: 'var(--sp-error)', fontWeight: 600 }}>Failed to load system statistics</p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted-foreground)', marginTop: '2px' }}>
                {statsError.message || 'Network error'} {statsError.requestId ? `(Request ID: ${statsError.requestId})` : ''}
              </p>
            </div>
            <button
              onClick={fetchStats}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px',
                background: 'var(--sp-accent)', color: '#fff', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600,
              }}
              data-testid="stats-retry-btn"
            >
              <Ico d={ICONS.refresh} size={13} /> Retry
            </button>
          </div>
        )}

        {/* ── Real Metrics grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '14px', marginBottom: '24px' }}>
          <SystemMetricsCard
            title="Registered Users"
            value={stats?.registered_users ? stats.registered_users.total.toLocaleString() : null}
            subtitle={userSubtitle}
            color="#3B82F6"
            iconName="Users"
            delay="0s"
            loading={statsLoading}
            error={stats?.registered_users === null && !statsLoading ? 'Unavailable' : null}
          />
          <SystemMetricsCard
            title="Live Sessions"
            value={stats?.live_sessions !== null && stats?.live_sessions !== undefined ? `${stats.live_sessions}` : null}
            subtitle={sessionsSubtitle}
            color="#10B981"
            iconName="Sessions"
            delay="0.07s"
            loading={statsLoading}
            error={stats?.live_sessions === null && !statsLoading ? 'Unavailable' : null}
          />
          <SystemMetricsCard
            title="Violations Today"
            value={stats?.violations_today !== null && stats?.violations_today !== undefined ? stats.violations_today : null}
            subtitle={violationsSubtitle}
            color="#F59E0B"
            trend={stats?.violations_7d || []}
            iconName="Violations"
            delay="0.14s"
            loading={statsLoading}
            error={stats?.violations_today === null && !statsLoading ? 'Unavailable' : null}
          />
          <SystemMetricsCard
            title="Server Status"
            value={stats?.server ? serverStatusLabel : null}
            subtitle={serverSubtitle}
            color={stats?.server?.database_ok ? '#10B981' : '#EF4444'}
            iconName="Server"
            delay="0.21s"
            loading={statsLoading}
            error={stats?.server === null && !statsLoading ? 'Unavailable' : null}
          />
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
      </main>
    </div>
  );
};

export default AdminPanel;
