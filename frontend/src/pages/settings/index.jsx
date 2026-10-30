import React, { useState, useEffect } from 'react';
import RoleBasedHeader from '../../components/ui/RoleBasedHeader';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import ThemeToggle from '../../components/ui/ThemeToggle';
import UpdateModal from '../../components/update/UpdateModal';
import { getAppVersion, isNativeApp } from '../../utils/platform';
import AppUpdate from '../../plugins/appUpdate';

const SettingsPage = () => {
  const [appVersion, setAppVersion] = useState('...');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null); // { type: 'success' | 'info' | 'error', message: string }
  const [availableRelease, setAvailableRelease] = useState(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAppVersion().then((ver) => {
      if (mounted) {
        setAppVersion(ver.replace(/^v/i, ''));
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);

    try {
      const result = await AppUpdate.checkForUpdate({ manual: true });

      if (result?.available) {
        setAvailableRelease(result);
        setIsUpdateModalOpen(true);
        setUpdateStatus({
          type: 'info',
          message: `New version ${result.latestVersion || result.tagName} is available.`,
        });
      } else {
        const curVer = result?.currentVersion || appVersion;
        setUpdateStatus({
          type: 'success',
          message: `You're up to date! Version ${curVer} is the latest release.`,
        });
      }
    } catch (err) {
      console.warn('[Settings] Failed to check for updates:', err);
      setUpdateStatus({
        type: 'error',
        message: err?.message || 'Unable to connect to GitHub. Please check your internet connection.',
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <RoleBasedHeader />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Title Header */}
        <div className="border-b border-border pb-5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Icon name="Settings" size={24} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
                Settings
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage app preferences, platform diagnostics, and version updates
              </p>
            </div>
          </div>
        </div>

        {/* In-App Updates Card (Section 6 Requirement) */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
            <div>
              <div className="flex items-center space-x-2">
                <Icon name="RefreshCw" size={18} className="text-primary" />
                <h2 className="text-lg font-heading font-semibold">
                  Software Updates
                </h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Updates are retrieved directly from GitHub Releases.
              </p>
            </div>

            <Button
              variant="default"
              onClick={handleCheckForUpdates}
              loading={checkingUpdate}
              iconName="Search"
              className="px-5 py-2.5 rounded-xl font-medium self-start sm:self-auto"
            >
              Check for Updates
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border/40">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Current Version
              </span>
              <p className="text-base font-semibold text-foreground mt-1">
                v{appVersion}
              </p>
            </div>

            <div className="p-3.5 bg-muted/40 rounded-xl border border-border/40">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Platform
              </span>
              <p className="text-base font-semibold text-foreground mt-1 flex items-center space-x-1.5">
                <Icon name={isNativeApp() ? "Smartphone" : "Globe"} size={16} className="text-primary" />
                <span>{isNativeApp() ? 'Android Native' : 'Web Shell'}</span>
              </p>
            </div>

            <div className="p-3.5 bg-muted/40 rounded-xl border border-border/40">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Release Channel
              </span>
              <p className="text-base font-semibold text-foreground mt-1 flex items-center space-x-1.5">
                <Icon name="Github" size={16} />
                <span>GitHub Releases</span>
              </p>
            </div>
          </div>

          {/* Status Feedback Banner */}
          {updateStatus && (
            <div
              className={`p-4 rounded-xl border text-sm flex items-start space-x-3 animate-fade-in ${
                updateStatus.type === 'success'
                  ? 'bg-success/10 border-success/30 text-success'
                  : updateStatus.type === 'info'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-error/10 border-error/30 text-error'
              }`}
            >
              <Icon
                name={
                  updateStatus.type === 'success'
                    ? 'CheckCircle'
                    : updateStatus.type === 'info'
                    ? 'ArrowDownCircle'
                    : 'AlertCircle'
                }
                size={20}
                className="flex-shrink-0 mt-0.5"
              />
              <div className="flex-1">
                <p className="font-medium">{updateStatus.message}</p>
                {updateStatus.type === 'info' && availableRelease && (
                  <button
                    onClick={() => setIsUpdateModalOpen(true)}
                    className="mt-2 text-xs font-semibold underline hover:no-underline"
                  >
                    View Release Details & Install
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Application Appearance & Preferences */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center space-x-2 border-b border-border/50 pb-3">
            <Icon name="Moon" size={18} className="text-primary" />
            <h2 className="text-lg font-heading font-semibold">
              Appearance & Theme
            </h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Theme Mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Toggle between light and dark themes
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </main>

      {/* Modern Update Available Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        release={availableRelease}
        onUpdateStarted={() => {
          setUpdateStatus({
            type: 'info',
            message: 'Update download started in background. Check your notification panel.',
          });
        }}
      />
    </div>
  );
};

export default SettingsPage;
