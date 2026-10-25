import React, { useState, useEffect } from 'react';
import Icon from '../AppIcon';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../services/authAwareCall';

const ProfileSettingsModal = ({
  isOpen,
  onClose,
  userRole = 'teacher',
  displayName = '',
  displayEmail = '',
  onProfileUpdated,
}) => {
  const [profileName, setProfileName] = useState(() => {
    return localStorage.getItem('sp:user_profile:name') || displayName || 'User';
  });
  const [institution, setInstitution] = useState(() => {
    return localStorage.getItem('sp:user_profile:institution') || 'SmartProctor Academic Institute';
  });
  const [department, setDepartment] = useState(() => {
    return localStorage.getItem('sp:user_profile:department') || 'Computer Science & Assessment';
  });
  const [timezone, setTimezone] = useState(() => {
    return localStorage.getItem('sp:user_profile:timezone') || 'Asia/Kolkata (IST, UTC+05:30)';
  });
  const [emailNotifs, setEmailNotifs] = useState(() => {
    return localStorage.getItem('sp:user_profile:email_notifs') !== 'false';
  });
  const [violationAlerts, setViolationAlerts] = useState(() => {
    return localStorage.getItem('sp:user_profile:violation_alerts') !== 'false';
  });
  const [profileSavedMsg, setProfileSavedMsg] = useState(false);

  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailFeedback, setTestEmailFeedback] = useState(null);

  useEffect(() => {
    if (displayName) {
      const stored = localStorage.getItem('sp:user_profile:name');
      if (!stored) setProfileName(displayName);
    }
  }, [displayName]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveProfile = (e) => {
    e.preventDefault();
    localStorage.setItem('sp:user_profile:name', profileName);
    localStorage.setItem('sp:user_profile:institution', institution);
    localStorage.setItem('sp:user_profile:department', department);
    localStorage.setItem('sp:user_profile:timezone', timezone);
    localStorage.setItem('sp:user_profile:email_notifs', String(emailNotifs));
    localStorage.setItem('sp:user_profile:violation_alerts', String(violationAlerts));

    onProfileUpdated?.({ name: profileName, institution, department });
    setProfileSavedMsg(true);
    setTimeout(() => setProfileSavedMsg(false), 3000);
  };

  const handleSendTestEmail = async () => {
    try {
      setSendingTestEmail(true);
      setTestEmailFeedback(null);
      const recipient = displayEmail || 'dt7215230@gmail.com';
      await authAwareCall({
        path: '/notifications/test-email',
        method: 'POST',
        body: { email: recipient, name: profileName },
        auth0Authenticated,
        getAccessTokenSilently,
        auth0Audience,
      });
      setTestEmailFeedback({
        success: true,
        message: 'Verification email sent via Brevo! Please check your inbox.',
      });
    } catch (err) {
      setTestEmailFeedback({
        success: false,
        message: err?.detail || err?.message || 'Failed to send test email',
      });
    } finally {
      setSendingTestEmail(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="User" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-heading font-semibold text-foreground">Profile Settings</h2>
              <p className="text-xs text-muted-foreground">Manage your identity, institution, and notifications</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveProfile} className="p-6 overflow-y-auto space-y-5 text-sm flex-1">
          {profileSavedMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center space-x-2 animate-in fade-in">
              <Icon name="CheckCircle" size={16} />
              <span>Profile settings updated successfully!</span>
            </div>
          )}

          {/* Identity Card */}
          <div className="flex items-center space-x-4 p-4 rounded-xl bg-muted/40 border border-border">
            <div className="w-14 h-14 rounded-full bg-primary/15 text-primary font-bold text-xl flex items-center justify-center border border-primary/20 shrink-0">
              {profileName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-foreground text-base truncate">{profileName}</h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary capitalize shrink-0">
                  {userRole}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{displayEmail || 'Connected via Auth0'}</p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <Icon name="ShieldCheck" size={12} />
                Verified Academic Account
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Display Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email Address</label>
              <input
                type="email"
                value={displayEmail || ''}
                disabled
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-muted-foreground text-xs sm:text-sm cursor-not-allowed opacity-80"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Institution / School</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Primary Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            >
              <option value="Asia/Kolkata (IST, UTC+05:30)">Asia/Kolkata (IST, UTC+05:30)</option>
              <option value="America/New_York (EST, UTC-05:00)">America/New_York (EST, UTC-05:00)</option>
              <option value="America/Los_Angeles (PST, UTC-08:00)">America/Los_Angeles (PST, UTC-08:00)</option>
              <option value="Europe/London (GMT, UTC+00:00)">Europe/London (GMT, UTC+00:00)</option>
              <option value="Asia/Tokyo (JST, UTC+09:00)">Asia/Tokyo (JST, UTC+09:00)</option>
            </select>
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Notifications & Alerts</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Brevo Transactional Email Service Connected
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={sendingTestEmail}
                className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-medium text-foreground transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="Mail" size={13} />
                <span>{sendingTestEmail ? 'Sending...' : 'Send Test Email'}</span>
              </button>
            </div>

            {testEmailFeedback && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                testEmailFeedback.success
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-error/10 text-error border border-error/20'
              }`}>
                <Icon name={testEmailFeedback.success ? 'CheckCircle' : 'AlertCircle'} size={14} />
                <span>{testEmailFeedback.message}</span>
              </div>
            )}

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs font-medium text-foreground">Email Summary Notifications</p>
                <p className="text-[11px] text-muted-foreground">Receive digest when exams end and attempts are submitted</p>
              </div>
              <input
                type="checkbox"
                checked={emailNotifs}
                onChange={(e) => setEmailNotifs(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs font-medium text-foreground">Critical Violation Alerts</p>
                <p className="text-[11px] text-muted-foreground">Instant alerts when multi-face or background speech is flagged</p>
              </div>
              <input
                type="checkbox"
                checked={violationAlerts}
                onChange={(e) => setViolationAlerts(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-sm transition"
            >
              Save Profile Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileSettingsModal;
