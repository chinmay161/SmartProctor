import React, { useState } from 'react';
import Icon from '../AppIcon';
import Button from '../ui/Button';
import { isNativeApp } from '../../utils/platform';
import AppUpdate from '../../plugins/appUpdate';

/**
 * Polished Material Design update dialog matching the Mihon-style update flow.
 */
/**
 * Cleanly renders markdown list items, headings, and bold markup without raw symbols.
 */
const formatMarkdownNotes = (raw) => {
  if (!raw || !raw.trim()) return '• General performance improvements and bug fixes.';
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('#')) {
        return line.replace(/^#+\s*/, '');
      }
      if (/^[\*\-\+]\s+/.test(line)) {
        return '• ' + line.replace(/^[\*\-\+]\s+/, '');
      }
      return line
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1');
    })
    .join('\n');
};

const UpdateModal = ({ isOpen, onClose, release, onUpdateStarted }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !release) return null;

  const versionText = release.latestVersion || release.versionName || release.tagName || 'Latest';
  const releaseNotes = formatMarkdownNotes(release.releaseNotes);

  const handleUpdateNow = async () => {
    setIsUpdating(true);
    setError(null);

    try {
      if (isNativeApp()) {
        const res = await AppUpdate.downloadAndInstall();
        if (res?.success) {
          if (onUpdateStarted) onUpdateStarted();
          onClose();
        } else {
          setError(res?.message || 'Failed to start download.');
        }
      } else if (release.apkUrl) {
        // Web fallback: download APK directly via browser
        window.open(release.apkUrl, '_blank', 'noopener,noreferrer');
        onClose();
      } else {
        setError('No direct APK download URL is available for this release.');
      }
    } catch (err) {
      console.error('[UpdateModal] Error launching update:', err);
      setError(err?.message || 'An unexpected error occurred while starting update.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLater = () => {
    sessionStorage.setItem('smartproctor_update_deferred', 'true');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
    >
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-6 text-card-foreground">
        {/* Header Icon + Title */}
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Icon name="ArrowDownCircle" size={24} />
          </div>
          <div>
            <h2 id="update-dialog-title" className="text-xl font-heading font-bold text-foreground">
              Update Available
            </h2>
            <p className="text-sm font-semibold text-primary">
              Version {versionText}
            </p>
          </div>
        </div>

        {/* What's New Section */}
        <div className="mt-4">
          <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-2">
            What's New
          </h3>
          <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 max-h-48 overflow-y-auto text-sm leading-relaxed text-foreground whitespace-pre-line font-normal">
            {releaseNotes}
          </div>
        </div>

        {/* Error notification if any */}
        {error && (
          <div className="mt-3 p-2.5 rounded-lg bg-error/10 border border-error/20 text-xs text-error flex items-start space-x-2">
            <Icon name="AlertTriangle" size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons: [Update Now] [Later] */}
        <div className="mt-6 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={handleLater}
            disabled={isUpdating}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"
          >
            Later
          </button>

          <Button
            variant="default"
            onClick={handleUpdateNow}
            loading={isUpdating}
            iconName="Download"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md"
          >
            Update Now
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
