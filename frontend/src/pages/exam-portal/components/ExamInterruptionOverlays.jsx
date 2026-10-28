import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const APP_RELOAD_KEY = 'sp_exam_reload';

/**
 * ExamInterruptionOverlays: view-only interruption overlays and banners.
 * Modal sheets fit 360 dp viewports and utilize dvh viewport units.
 */
const ExamInterruptionOverlays = ({
  loadWarning,
  clientVision,
  vision,
  screenRecordingRequired,
  screenShareBlocked,
  screenShareLost,
  onReshareScreen,
  micRequired,
  micBlocked,
  onRetryMic,
  authReconnecting,
  socketConnecting,
  socketReconnecting,
  proctorWarning,
  onDismissProctorWarning,
  browserLockdownEnabled,
  isFullscreen,
  onEnterFullscreen,
  violationLock,
  isNative = false,
}) => {
  return (
    <>
      {loadWarning && (
        <div className="bg-warning/15 border-b border-warning/30 px-3 sm:px-4 py-2 text-xs text-warning">
          {loadWarning}
        </div>
      )}

      {clientVision && vision?.cameraStatus?.state === 'lost' && (
        <div role="alert" className="bg-destructive/15 border-b border-destructive/30 px-3 sm:px-4 py-3 text-xs sm:text-sm text-destructive flex flex-wrap items-center justify-between gap-3">
          {vision.cameraStatus.permission === 'denied' ? (
            <>
              <span className="flex-1 min-w-[200px]">
                <strong>Camera access is blocked for this site.</strong> Click the lock icon in the address bar → Site settings →
                Camera → Allow. Proctoring resumes automatically; if your browser asks you to reload, use the button.
              </span>
              <Button size="sm" variant="outline" className="touch-target" onClick={() => {
                try { sessionStorage.setItem(APP_RELOAD_KEY, '1'); } catch { /* best-effort */ }
                window.location.reload();
              }}>
                Reload
              </Button>
            </>
          ) : (
            <span>
              <strong>Camera disconnected — reconnecting…</strong> Check that the camera is plugged in, switched on, and not used
              by another app. Your answers are saved.
            </span>
          )}
        </div>
      )}

      {!screenShareBlocked && screenShareLost && (
        <div role="alert" className="bg-destructive/15 border-b border-destructive/30 px-3 sm:px-4 py-3 text-xs sm:text-sm text-destructive flex flex-wrap items-center justify-between gap-3">
          <span className="flex-1 min-w-[200px]"><strong>{screenShareLost.title}.</strong> {screenShareLost.steps?.join(' ')}</span>
          <Button size="sm" variant="outline" iconName="Monitor" className="touch-target" onClick={onReshareScreen}>Share entire screen</Button>
        </div>
      )}

      {screenRecordingRequired && screenShareBlocked && (
        <div className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto min-h-dvh">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-5 sm:p-6 text-center my-auto">
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-destructive/15 flex items-center justify-center mb-4">
              <Icon name="Monitor" size={26} className="text-destructive" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-2">Screen Sharing Required</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-5">
              Screen sharing stopped. Share your entire screen to continue.
            </p>
            {screenShareLost?.title && screenShareLost.title !== 'Screen sharing stopped' && (
              <p className="text-xs text-destructive mb-4">
                {screenShareLost.title}
              </p>
            )}
            <Button
              variant="default"
              size="lg"
              iconName="Monitor"
              onClick={onReshareScreen}
              className="w-full touch-target"
            >
              Share entire screen
            </Button>
          </div>
        </div>
      )}

      {micRequired && micBlocked && (
        <div className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto min-h-dvh">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-5 sm:p-6 text-center my-auto">
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-destructive/15 flex items-center justify-center mb-4">
              <Icon name="MicOff" size={26} className="text-destructive" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-2">Microphone not available</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-5">
              Audio proctoring is required for this exam, but the microphone is not running. Please check your microphone connection and browser permissions, then click Retry.
            </p>
            <Button
              variant="default"
              size="lg"
              iconName="RefreshCw"
              onClick={onRetryMic}
              className="w-full touch-target"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {socketConnecting && !socketReconnecting && (
        <div role="status" className="bg-primary/10 border-b border-primary/20 px-3 sm:px-4 py-1.5 text-xs text-primary flex items-center gap-2">
          <Icon name="Loader2" size={14} className="animate-spin shrink-0" />
          <span>Connecting to live proctoring service…</span>
        </div>
      )}

      {(authReconnecting || socketReconnecting) && (
        <div role="status" className="bg-warning/15 border-b border-warning/30 px-3 sm:px-4 py-2 text-xs text-warning flex items-center gap-2">
          <Icon name="RefreshCw" size={14} className="animate-spin shrink-0" />
          <span>Reconnecting… your answers are kept and will sync once the connection is restored.</span>
        </div>
      )}

      {proctorWarning && (
        <div className="bg-destructive/15 border-l-4 border-destructive/80 px-3 sm:px-4 py-3 text-xs sm:text-sm text-destructive font-semibold flex items-center justify-between shadow-sm z-50 animate-in slide-in-from-top-2 gap-2">
          <div className="flex items-center min-w-0">
            <Icon name="AlertTriangle" className="mr-2 sm:mr-3 shrink-0" size={18} />
            <span className="truncate">{proctorWarning}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onDismissProctorWarning} className="touch-target shrink-0">
            Dismiss
          </Button>
        </div>
      )}

      {/* Web lockdown fullscreen sheet (interim: never required on native app) */}
      {!isNative && browserLockdownEnabled && !isFullscreen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto min-h-dvh">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-5 sm:p-6 text-center my-auto">
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-primary/15 flex items-center justify-center mb-4">
              <Icon name="Maximize" size={26} className="text-primary" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-2">Fullscreen Required</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-5">
              This exam uses browser lockdown. Enter fullscreen to continue and keep the exam active.
            </p>
            <Button
              variant="default"
              size="lg"
              iconName="Maximize"
              onClick={onEnterFullscreen}
              className="w-full touch-target"
            >
              Enter Fullscreen
            </Button>
          </div>
        </div>
      )}

      {violationLock && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto min-h-dvh">
          <div className="max-w-xl w-full bg-card border border-destructive/50 rounded-2xl shadow-2xl p-5 sm:p-7 text-center my-auto">
            <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-full bg-destructive/15 flex items-center justify-center mb-4">
              <Icon name="AlertTriangle" size={30} className="text-destructive" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-2">Security Violation Detected</h2>
            <p className="text-sm sm:text-base text-destructive font-medium mb-4">{violationLock.message}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Exam controls are temporarily locked for {Math.max(1, Math.round(violationLock.durationMs / 1000))} seconds.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default ExamInterruptionOverlays;
