import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../AppIcon';
import SmartProctorLogo from './SmartProctorLogo';
import ThemeToggle from './ThemeToggle';
import ProfileSettingsModal from './ProfileSettingsModal';
import PreferencesModal from './PreferencesModal';
import HelpSupportModal from './HelpSupportModal';
import { useSession } from '../../context/SessionContext';

const RoleBasedHeader = ({ userRole = 'student', userName = 'User', onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const profileMenuRef = useRef(null);
  const { logout, profile: remoteProfile } = useSession();
  const { user: auth0User } = useAuth0();

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

  const displayName = (userName && userName !== 'User')
    ? userName
    : (auth0User?.name || auth0User?.nickname || auth0User?.email || remoteProfile?.email || 'User');
  const displayRole = remoteProfile?.role || userRole;
  const displayEmail = auth0User?.email || remoteProfile?.email || null;
  const displayId = auth0User?.sub || remoteProfile?.auth0_sub || null;

  const isActivePath = (path) => location?.pathname === path;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-[1000] bg-card shadow-md transition-smooth">
        <div className="mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <div
                className="flex items-center space-x-3 cursor-pointer"
                onClick={() => handleNavigation(currentNavItems[0]?.path || '/')}
              >
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center transition-smooth hover:bg-primary/20">
                  <SmartProctorLogo size={24} />
                </div>
                <span className="text-xl font-heading font-semibold text-foreground">SmartProctor</span>
              </div>

              <nav className="hidden lg:flex items-center space-x-1">
                {currentNavItems?.map((item) => (
                  <button
                    key={item?.path}
                    onClick={() => handleNavigation(item?.path)}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-smooth cursor-pointer ${
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
              <ThemeToggle floating={false} />

              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="flex items-center space-x-3 p-2 hover:bg-muted rounded-md transition-smooth cursor-pointer"
                >
                  <div className="w-8 h-8 bg-primary/20 text-primary font-bold text-xs rounded-full flex items-center justify-center">
                    {displayName?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-sm font-medium text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{displayRole}</p>
                  </div>
                  <Icon name="ChevronDown" size={16} className="text-muted-foreground" />
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 z-[1010] bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-in fade-in duration-100">
                    <div className="p-3 border-b border-border">
                      <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{displayRole} Account</p>
                      {displayEmail && <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>}
                      {displayId && <p className="text-[10px] text-muted-foreground break-all">{displayId}</p>}
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setShowProfileModal(true);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3 cursor-pointer"
                      >
                        <Icon name="User" size={16} />
                        <span>Profile</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setShowPreferencesModal(true);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3 cursor-pointer"
                      >
                        <Icon name="Sliders" size={16} />
                        <span>Preferences</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          navigate('/settings');
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3 cursor-pointer"
                      >
                        <Icon name="Settings" size={16} />
                        <span>Settings</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setShowHelpModal(true);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-smooth flex items-center space-x-3 cursor-pointer"
                      >
                        <Icon name="HelpCircle" size={16} />
                        <span>Help & Support</span>
                      </button>
                    </div>
                    <div className="border-t border-border py-1">
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-left text-sm text-error hover:bg-muted transition-smooth flex items-center space-x-3 cursor-pointer"
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
                className="lg:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth cursor-pointer"
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
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-smooth cursor-pointer ${
                    isActivePath(item?.path)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon name={item?.icon} size={20} />
                  <span className="text-sm font-medium">{item?.label}</span>
                </button>
              ))}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  navigate('/settings');
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-smooth cursor-pointer ${
                  isActivePath('/settings')
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon name="Settings" size={20} />
                <span className="text-sm font-medium">Settings & Updates</span>
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Modals */}
      <ProfileSettingsModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
      <PreferencesModal
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
      />
      <HelpSupportModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </>
  );
};

export default RoleBasedHeader;
