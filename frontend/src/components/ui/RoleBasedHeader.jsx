import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../AppIcon';
import ThemeToggle from './ThemeToggle';
import { useLogout } from '../../context/SessionContext';
import { apiRequest } from '../../services/api';


const RoleBasedHeader = ({ userRole = 'student', userName = 'User', onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const notificationRef = useRef(null);
  const [remoteProfile, setRemoteProfile] = useState(null);
  const { logout } = useLogout();
  const {
    user: auth0User,
    isAuthenticated: auth0Authenticated,
    getAccessTokenSilently,
    logout: auth0Logout,
  } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const navigationItems = {
    student: [
      { label: 'Dashboard', path: '/student-dashboard', icon: 'LayoutDashboard' },
      { label: 'Exam Portal', path: '/exam-portal', icon: 'FileText' }
    ],
    teacher: [
      { label: 'Dashboard', path: '/teacher-dashboard', icon: 'LayoutDashboard' },
      { label: 'Create Exam', path: '/exam-creation', icon: 'FilePlus' },
      { label: 'Question Bank', path: '/question-bank-management', icon: 'Database' }
    ],
    admin: [
      { label: 'Admin Panel', path: '/admin-panel', icon: 'Settings' }
    ]
  };

  const currentNavItems = navigationItems?.[userRole] || [];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef?.current && !profileMenuRef?.current?.contains(event?.target)) {
        setIsProfileMenuOpen(false);
      }
      if (notificationRef?.current && !notificationRef?.current?.contains(event?.target)) {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location?.pathname]);

  const handleNavigation = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    const perform = async () => {
      try {
        if (onLogout) {
          try {
            await onLogout();
          } catch (e) {
            // ignore parent handler errors
            console.warn('onLogout handler error', e);
          }
        } else {
          await logout(false);
        }
      } catch (err) {
        console.error('Logout failed', err);
      }
      if (auth0Authenticated) {
        auth0Logout({
          logoutParams: {
            returnTo: `${window.location.origin}/login`,
          },
        });
        return;
      }
      navigate('/login');
    };

    perform();
  };
  useEffect(() => {
    let mounted = true;

    const fetchProfile = async () => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: auth0Audience,
          },
        });
        const profile = await apiRequest('/profile/me', 'GET', null, token);
        if (!mounted) return;
        if (profile) {
          setRemoteProfile(profile);
          return;
        }
      } catch {
        if (mounted) setRemoteProfile(null);
      }
    };

    if (auth0Authenticated) {
      fetchProfile();
    }

    return () => { mounted = false; };
  }, [auth0Authenticated, getAccessTokenSilently, auth0Audience]);

  const displayName = (userName && userName !== 'User')
    ? userName
    : (auth0User?.name || auth0User?.nickname || auth0User?.email || remoteProfile?.email || 'User');
  const displayRole = remoteProfile?.role || userRole;
  const displayEmail = auth0User?.email || remoteProfile?.email || null;
  const displayId = auth0User?.sub || remoteProfile?.auth0_sub || null;

  const isActivePath = (path) => location?.pathname === path;

  return (
    <header className="fixed top-0 left-0 right-0 z-1000 bg-card shadow-md transition-smooth">
      <div className="mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center transition-smooth hover:bg-primary/30">
                <Icon name="GraduationCap" size={24} color="var(--color-primary)" />
              </div>
              <span className="text-xl font-heading font-semibold text-foreground">SmartProctor</span>
            </div>

            <nav className="hidden lg:flex items-center space-x-1">
              {currentNavItems?.map((item) => (
                <button
                  key={item?.path}
                  onClick={() => handleNavigation(item?.path)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-smooth ${
                    isActivePath(item?.path)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon name={item?.icon} size={18} />
                  <span className="text-sm font-medium">{item?.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth"
              >
                <Icon name="Bell" size={20} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>
              </button>

              {isNotificationOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <div className="p-4 hover:bg-muted transition-smooth cursor-pointer">
                      <div className="flex items-start space-x-3">
                        <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                          <Icon name="AlertCircle" size={16} color="var(--color-primary)" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-medium">System Update</p>
                          <p className="text-xs text-muted-foreground mt-1">New features available in exam monitoring</p>
                          <p className="text-xs text-muted-foreground mt-1 font-caption">2 hours ago</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 hover:bg-muted transition-smooth cursor-pointer">
                      <div className="flex items-start space-x-3">
                        <div className="w-8 h-8 bg-success/20 rounded-full flex items-center justify-center shrink-0">
                          <Icon name="CheckCircle" size={16} color="var(--color-success)" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-medium">Exam Completed</p>
                          <p className="text-xs text-muted-foreground mt-1">Your recent exam has been submitted successfully</p>
                          <p className="text-xs text-muted-foreground mt-1 font-caption">5 hours ago</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 border-t border-border text-center">
                    <button className="text-sm text-primary hover:text-primary/80 transition-smooth">
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            <ThemeToggle />

            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center space-x-3 p-2 hover:bg-muted rounded-md transition-smooth"
              >
                <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                  <Icon name="User" size={18} color="var(--color-primary)" />
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-sm font-medium text-foreground">{displayName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{displayRole}</p>
                </div>
                <Icon name="ChevronDown" size={16} className="text-muted-foreground" />
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                  <div className="p-3 border-b border-border">
                    <p className="text-sm font-medium text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{displayRole} Account</p>
                    {displayEmail && <p className="text-xs text-muted-foreground">{displayEmail}</p>}
                    {displayId && <p className="text-[10px] text-muted-foreground break-all">{displayId}</p>}
                  </div>
                  <div className="py-2">
                    <button className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3">
                      <Icon name="User" size={16} />
                      <span>Profile Settings</span>
                    </button>
                    <button className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3">
                      <Icon name="Settings" size={16} />
                      <span>Preferences</span>
                    </button>
                    <button className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3">
                      <Icon name="HelpCircle" size={16} />
                      <span>Help & Support</span>
                    </button>
                  </div>
                  <div className="border-t border-border py-2">
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-sm text-error hover:bg-muted transition-smooth flex items-center space-x-3"
                    >
                      <Icon name="LogOut" size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth"
            >
              <Icon name={isMobileMenuOpen ? 'X' : 'Menu'} size={24} />
            </button>
          </div>
        </div>
      </div>
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-card border-t border-border">
          <nav className="px-4 py-4 space-y-2">
            {currentNavItems?.map((item) => (
              <button
                key={item?.path}
                onClick={() => handleNavigation(item?.path)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-smooth ${
                  isActivePath(item?.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon name={item?.icon} size={20} />
                <span className="text-sm font-medium">{item?.label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};

export default RoleBasedHeader;
