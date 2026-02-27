import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import RoleBasedHeader from '../../components/ui/RoleBasedHeader';
import { useLogout } from '../../context/SessionContext';
import SecurityBadgeDisplay from '../../components/ui/SecurityBadgeDisplay';
import SystemMetricsCard from './components/SystemMetricsCard';
import UserManagementTable from './components/UserManagementTable';
import SystemSettingsPanel from './components/SystemSettingsPanel';
import ReportsSection from './components/ReportsSection';
import SecurityMonitoring from './components/SecurityMonitoring';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import { apiRequest } from '../../services/api';
import { dashboardForRoles, extractRolesFromAuth0User } from '../../utils/roleUtils';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('user-management');
  const [accessChecking, setAccessChecking] = useState(true);
  const [accessError, setAccessError] = useState('');
  const navigate = useNavigate();
  const {
    getAccessTokenSilently,
    isAuthenticated: isAuth0Authenticated,
    user: auth0User,
  } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const { logout } = useLogout();

  const handleLogout = () => {
    const doLogout = async () => {
      try {
        await logout(false);
      } catch (e) {
        console.error('Logout failed', e);
      }
    };

    doLogout();
  };

  const [systemMetrics, setSystemMetrics] = useState([
    {
      title: 'Total Active Users',
      value: '18,542',
      change: '+12.5%',
      changeType: 'positive',
      icon: 'Users',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/20',
      trend: [45, 52, 48, 65, 59, 80, 75]
    },
    {
      title: 'Concurrent Exams',
      value: '47',
      change: '+8.3%',
      changeType: 'positive',
      icon: 'FileText',
      iconColor: 'text-success',
      iconBg: 'bg-success/20',
      trend: [30, 35, 40, 38, 45, 42, 47]
    },
    {
      title: 'System Performance',
      value: '98.7%',
      change: '+0.5%',
      changeType: 'positive',
      icon: 'Activity',
      iconColor: 'text-accent',
      iconBg: 'bg-accent/20',
      trend: [95, 96, 97, 96, 98, 97, 98]
    },
    {
      title: 'Total Violations',
      value: '342',
      change: '-15.2%',
      changeType: 'positive',
      icon: 'AlertTriangle',
      iconColor: 'text-warning',
      iconBg: 'bg-warning/20',
      trend: [60, 55, 50, 45, 40, 38, 35]
    }
  ]);

  useEffect(() => {
    let cancelled = false;

    const verifyAdminAccess = async () => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: { audience: auth0Audience },
        });
        await apiRequest('/admin/access-check', 'GET', null, token);
        if (!cancelled) {
          setAccessError('');
          setAccessChecking(false);
        }
      } catch (err) {
        if (cancelled) return;
        const message = String(err?.message || '');
        if (message.includes('403') || message.toLowerCase().includes('insufficient permissions')) {
          setAccessChecking(false);
          const claimedRoles = extractRolesFromAuth0User(auth0User);
          let redirectPath = dashboardForRoles(claimedRoles);

          // Fallback if role claims are not present in the Auth0 user object.
          if (redirectPath === '/login') {
            try {
              const profile = await apiRequest('/profile/me', 'GET', null, token);
              if (profile?.role) {
                redirectPath = dashboardForRoles([profile.role]);
              }
            } catch (_) {
              // Keep login fallback if profile lookup fails.
            }
          }

          navigate(redirectPath, { replace: true });
          return;
        }
        setAccessError('Failed to verify admin access. Please try again.');
        setAccessChecking(false);
      }
    };

    if (isAuth0Authenticated) {
      verifyAdminAccess();
    } else {
      setAccessChecking(false);
    }
    return () => { cancelled = true; };
  }, [auth0Audience, auth0User, getAccessTokenSilently, isAuth0Authenticated, navigate]);

  if (accessChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Checking admin access...</p>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">Admin Panel Unavailable</h2>
          <p className="text-sm text-muted-foreground">{accessError}</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'user-management', label: 'User Management', icon: 'Users' },
    { id: 'system-settings', label: 'System Settings', icon: 'Settings' },
    { id: 'reports', label: 'Reports', icon: 'BarChart3' },
    { id: 'security', label: 'Security', icon: 'Shield' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'user-management':
        return <UserManagementTable />;
      case 'system-settings':
        return <SystemSettingsPanel />;
      case 'reports':
        return <ReportsSection />;
      case 'security':
        return <SecurityMonitoring />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <RoleBasedHeader
        userRole="admin"
        onLogout={handleLogout}
      />
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
              <div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-heading font-semibold text-foreground mb-2">
                  Admin Panel
                </h1>
                <p className="text-sm md:text-base text-muted-foreground">
                  System-wide oversight and user management
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" iconName="Download">
                  Export Data
                </Button>
                <Button variant="default" iconName="Plus">
                  Add User
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            {systemMetrics?.map((metric, index) => (
              <SystemMetricsCard key={index} {...metric} />
            ))}
          </div>

          <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden mb-6 md:mb-8">
            <div className="border-b border-border overflow-x-auto">
              <nav className="flex space-x-1 p-2 min-w-max">
                {tabs?.map((tab) => (
                  <button
                    key={tab?.id}
                    onClick={() => setActiveTab(tab?.id)}
                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-md text-sm font-medium transition-smooth whitespace-nowrap ${
                      activeTab === tab?.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon name={tab?.icon} size={18} />
                    <span>{tab?.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-4 md:p-6">
              {renderTabContent()}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 md:mb-8">
            <div className="lg:col-span-2 bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                  <Icon name="Bell" size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-heading font-semibold text-foreground">
                    System Notifications
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Recent system events and updates
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start space-x-3 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <Icon name="CheckCircle" size={20} className="text-success shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">System Update Completed</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Version 2.5.0 deployed successfully with new proctoring features
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-caption">2 hours ago</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                  <Icon name="AlertTriangle" size={20} className="text-warning shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">High Violation Rate Detected</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      MIT institution showing 25% increase in violations this week
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-caption">5 hours ago</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <Icon name="Info" size={20} className="text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Scheduled Maintenance</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      System maintenance scheduled for January 25, 2026 at 2:00 AM EST
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-caption">1 day ago</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
                  <Icon name="Zap" size={20} className="text-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-heading font-semibold text-foreground">
                    Quick Actions
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Common tasks
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Button variant="outline" fullWidth iconName="UserPlus" iconPosition="left">
                  Create New User
                </Button>
                <Button variant="outline" fullWidth iconName="Upload" iconPosition="left">
                  Bulk Import Users
                </Button>
                <Button variant="outline" fullWidth iconName="Mail" iconPosition="left">
                  Broadcast Notification
                </Button>
                <Button variant="outline" fullWidth iconName="Download" iconPosition="left">
                  Generate Report
                </Button>
                <Button variant="outline" fullWidth iconName="Settings" iconPosition="left">
                  System Configuration
                </Button>
              </div>
            </div>
          </div>

          <SecurityBadgeDisplay variant="footer" />
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
