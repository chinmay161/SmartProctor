import React, { useEffect } from 'react';
import Icon from '../AppIcon';
import { useSession } from '../../context/SessionContext';
import { useAuth0 } from '@auth0/auth0-react';

const ProfileSettingsModal = ({ isOpen, onClose }) => {
  const { profile, role } = useSession();
  const { user: auth0User } = useAuth0();

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

  const displayName = profile?.name || auth0User?.name || auth0User?.nickname || 'Academic User';
  const displayEmail = profile?.email || auth0User?.email || '—';
  const displayRole = profile?.role || role || 'student';
  const displayInstitution = profile?.institution || 'Institution SSO';
  const auth0Sub = profile?.auth0_sub || auth0User?.sub || '—';

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="User" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-heading font-semibold text-foreground">Profile Details</h2>
              <p className="text-xs text-muted-foreground">Account and academic institutional identity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Read-only details from /profile/me & session */}
        <div className="p-6 space-y-5 text-sm">
          {/* Identity Card */}
          <div className="flex items-center space-x-4 p-4 rounded-xl bg-muted/40 border border-border">
            <div className="w-14 h-14 rounded-full bg-primary/15 text-primary font-bold text-xl flex items-center justify-center border border-primary/20 shrink-0">
              {displayName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-foreground text-base truncate">{displayName}</h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary capitalize shrink-0">
                  {displayRole}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <Icon name="ShieldCheck" size={12} />
                Single Sign-On Verified
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                disabled
                readOnly
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-xs sm:text-sm cursor-not-allowed opacity-90"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email Address</label>
              <input
                type="email"
                value={displayEmail}
                disabled
                readOnly
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-xs sm:text-sm cursor-not-allowed opacity-90"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Assigned Role</label>
              <input
                type="text"
                value={displayRole.toUpperCase()}
                disabled
                readOnly
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-xs sm:text-sm cursor-not-allowed opacity-90 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Institution</label>
              <input
                type="text"
                value={displayInstitution}
                disabled
                readOnly
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-xs sm:text-sm cursor-not-allowed opacity-90"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Auth0 Identifier</label>
            <input
              type="text"
              value={auth0Sub}
              disabled
              readOnly
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-muted-foreground text-[11px] font-mono cursor-not-allowed break-all"
            />
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground flex items-start gap-2">
            <Icon name="Info" size={16} className="text-primary shrink-0 mt-0.5" />
            <p>
              Profile and role permissions are managed by your academic institution single sign-on system. To update your name or role, contact your institution administrator.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettingsModal;
