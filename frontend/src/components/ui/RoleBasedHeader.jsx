import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../AppIcon';
import ThemeToggle from './ThemeToggle';
import { authAwareCall } from '../../services/authAwareCall';
import SmartProctorLogo from './SmartProctorLogo';
import { useSession } from '../../context/SessionContext';
import ProfileSettingsModal from './ProfileSettingsModal';
import PreferencesModal from './PreferencesModal';
import HelpSupportModal from './HelpSupportModal';

const RoleBasedHeader = ({ userRole = 'student', userName = 'User', onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [customDisplayName, setCustomDisplayName] = useState(() => {
    try { return localStorage.getItem('sp:user_profile:name') || null; } catch { return null; }
  });
  const profileMenuRef = useRef(null);
  const notificationRef = useRef(null);
  const { logout, profile: remoteProfile } = useSession();
  const { user: auth0User, isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [realNotifications, setRealNotifications] = useState([]);
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const stored = localStorage.getItem('sp:read_notifs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

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

  useEffect(() => {
    let mounted = true;
    const fetchRealNotifications = async () => {
      try {
        const notifs = [];
        if (userRole === 'teacher') {
          const exams = await authAwareCall({
            path: '/exams/',
            method: 'GET',
            auth0Authenticated,
            getAccessTokenSilently,
            auth0Audience,
            fallbackPaths: []
          });
          if (Array.isArray(exams) && mounted) {
            exams.forEach((exam) => {
              if (exam?.status === 'ACTIVE' && !exam?.is_template) {
                notifs.push({
                  id: `active-${exam.id}`,
                  title: 'Active Exam In Progress',
                  message: `"${exam.title}" is currently live. Click to monitor exam session.`,
                  time: 'Live',
                  icon: 'PlayCircle',
                  color: 'text-emerald-500',
                  bg: 'bg-emerald-500/20',
                  path: `/exam-monitoring/${exam.id}`
                });
              }
              if (exam?.status === 'ENDED' && !exam?.is_template && !exam?.results_visible) {
                notifs.push({
                  id: `ended-${exam.id}`,
                  title: 'Results Ready for Release',
                  message: `"${exam.title}" has concluded. Review attempts and publish scores.`,
                  time: 'Completed',
                  icon: 'CheckCircle',
                  color: 'text-amber-500',
                  bg: 'bg-amber-500/20',
                  path: '/teacher-dashboard?tab=completed'
                });
              }
              if (exam?.status === 'SCHEDULED' && !exam?.is_template) {
                const dateStr = exam?.start_time ? new Date(exam.start_time).toLocaleDateString() : '';
                notifs.push({
                  id: `sched-${exam.id}`,
                  title: 'Upcoming Scheduled Exam',
                  message: `"${exam.title}" is set to begin on ${dateStr}.`,
                  time: 'Scheduled',
                  icon: 'Calendar',
                  color: 'text-primary',
                  bg: 'bg-primary/20',
                  path: '/teacher-dashboard?tab=scheduled'
                });
              }
            });
            setRealNotifications(notifs);
          }
        } else if (userRole === 'student') {
          const studentExams = await authAwareCall({
            path: '/student/exams',
            method: 'GET',
            auth0Authenticated,
            getAccessTokenSilently,
            auth0Audience,
            fallbackPaths: []
          });
          if (Array.isArray(studentExams) && mounted) {
            studentExams.forEach((exam) => {
              if (exam?.status === 'ACTIVE') {
                notifs.push({
                  id: `st-active-${exam.id}`,
                  title: 'Exam Live',
                  message: `"${exam.title}" is open for you to take now.`,
                  time: 'Live now',
                  icon: 'AlertCircle',
                  color: 'text-emerald-500',
                  bg: 'bg-emerald-500/20',
                  path: '/exam-portal'
                });
              }
              if (exam?.results_visible) {
                notifs.push({
                  id: `st-res-${exam.id}`,
                  title: 'Exam Results Released',
                  message: `Results and scoring for "${exam.title}" are now available.`,
                  time: 'Graded',
                  icon: 'Award',
                  color: 'text-blue-500',
                  bg: 'bg-blue-500/20',
                  path: `/student-dashboard/results/${exam.id}`
                });
              }
            });
            setRealNotifications(notifs);
          }
        }
      } catch (err) {
        if (mounted) setRealNotifications([]);
      }
    };

    fetchRealNotifications();
    return () => { mounted = false; };
  }, [userRole, auth0Authenticated]);

  const unreadNotifs = realNotifications.filter((n) => !readNotifIds.includes(n.id));
  const unreadCount = unreadNotifs.length;

  const markAllAsRead = () => {
    const allIds = realNotifications.map((n) => n.id);
    const updated = Array.from(new Set([...readNotifIds, ...allIds]));
    setReadNotifIds(updated);
    try {
      localStorage.setItem('sp:read_notifs', JSON.stringify(updated));
    } catch {}
  };

  const handleNotificationClick = (item) => {
    if (!readNotifIds.includes(item.id)) {
      const updated = [...readNotifIds, item.id];
      setReadNotifIds(updated);
      try {
        localStorage.setItem('sp:read_notifs', JSON.stringify(updated));
      } catch {}
    }
    setIsNotificationOpen(false);
    if (item.path) {
      navigate(item.path);
    }
  };

  const handleNavigation = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    const perform = async () => {
      try {
        if (onLogout) {
          await onLogout();
        } else {
          logout();
        }
      } catch (err) {
        console.warn('onLogout handler error', err);
        logout();
      }
    };

    perform();
  };

  const openProfileModal = () => {
    setIsProfileModalOpen(true);
    setIsProfileMenuOpen(false);
  };

  const openPreferencesModal = () => {
    setIsPreferencesModalOpen(true);
    setIsProfileMenuOpen(false);
  };

  const openHelpModal = () => {
    setIsHelpModalOpen(true);
    setIsProfileMenuOpen(false);
  };

  const baseDisplayName = (userName && userName !== 'User')
    ? userName
    : (auth0User?.name || auth0User?.nickname || auth0User?.email || remoteProfile?.email || 'User');
  const displayName = customDisplayName || baseDisplayName;
  const displayRole = remoteProfile?.role || userRole;
  const displayEmail = auth0User?.email || remoteProfile?.email || null;
  const displayId = auth0User?.sub || remoteProfile?.auth0_sub || null;

  const isActivePath = (path) => location?.pathname === path;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-[1000] bg-white/95 dark:bg-[#070B14]/95 backdrop-blur-xl border-b border-slate-200/90 dark:border-slate-800/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)] transition-colors">
        <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400" />
        <div className="mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center">
                  <SmartProctorLogo size={36} />
                </div>
                <span className="text-xl font-heading font-bold tracking-tight text-foreground">Smart<span className="text-primary">Proctor</span></span>
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
                  title="Notifications"
                >
                  <Icon name="Bell" size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-error rounded-full animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {isNotificationOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 z-[1010] bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-3.5 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                        {unreadCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                            {unreadCount} new
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-normal">
                            Live Feed
                          </span>
                        )}
                      </div>
                      {realNotifications.length > 0 && unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
                      {realNotifications.length === 0 ? (
                        <div className="py-8 px-4 text-center text-muted-foreground">
                          <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-2 text-muted-foreground">
                            <Icon name="Bell" size={20} />
                          </div>
                          <p className="text-sm font-medium text-foreground">No new notifications</p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                            You're all caught up! Real alerts about live exams, pending score releases, and submissions will appear here.
                          </p>
                        </div>
                      ) : (
                        realNotifications.map((n) => {
                          const isUnread = !readNotifIds.includes(n.id);
                          return (
                            <div
                              key={n.id}
                              onClick={() => handleNotificationClick(n)}
                              className={`p-3.5 hover:bg-muted/60 transition-colors cursor-pointer flex items-start gap-3 ${
                                isUnread ? 'bg-primary/5' : ''
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-full ${n.bg || 'bg-muted'} flex items-center justify-center shrink-0`}>
                                <Icon name={n.icon || 'Bell'} size={16} className={n.color || 'text-foreground'} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p className={`text-xs font-semibold truncate ${isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
                                    {n.title}
                                  </p>
                                  <span className="text-[10px] text-muted-foreground shrink-0">{n.time}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                                  {n.message}
                                </p>
                              </div>
                              {isUnread && (
                                <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <ThemeToggle floating={false} />

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
                  <div className="absolute right-0 mt-2 w-56 z-[1010] bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                    <div className="p-3 border-b border-border">
                      <p className="text-sm font-medium text-foreground">{displayName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{displayRole}</p>
                      {displayEmail && <p className="text-xs text-muted-foreground">{displayEmail}</p>}

                    </div>
                    <div className="py-2">
                      <button
                        onClick={openProfileModal}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3"
                      >
                        <Icon name="User" size={16} />
                        <span>Profile Settings</span>
                      </button>
                      <button
                        onClick={openPreferencesModal}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3"
                      >
                        <Icon name="Settings" size={16} />
                        <span>Preferences</span>
                      </button>
                      <button
                        onClick={openHelpModal}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3"
                      >
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

      <ProfileSettingsModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userRole={displayRole}
        displayName={displayName}
        displayEmail={displayEmail}
        onProfileUpdated={(updated) => {
          if (updated?.name) {
            setCustomDisplayName(updated.name);
          }
        }}
      />

      <PreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
      />

      <HelpSupportModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </>
  );
};

export default RoleBasedHeader;
