import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import { isNativeApp } from '../../utils/platform';
import { ExamLock } from '../../plugins/examLock';

const ExamLockSpikePage = () => {
  const navigate = useNavigate();
  const isNative = isNativeApp();

  const [state, setState] = useState({
    secure: false,
    lockTaskMode: 'none',
    lockTaskModeCode: 0,
    inMultiWindow: false,
    inPip: false,
    interruptionFilter: 1,
    interruptionFilterName: 'ALL',
  });
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [lastAction, setLastAction] = useState(null);

  const eventsEndRef = useRef(null);

  const appendEvent = useCallback((name, payload) => {
    const newEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      timestamp: payload?.timestamp || Date.now(),
      payload,
    };
    setEvents((prev) => [newEntry, ...prev.slice(0, 99)]); // keep latest 100
  }, []);

  const refreshState = useCallback(async () => {
    try {
      setLoading(true);
      const res = await ExamLock.getState();
      setState(res);
      setLastAction({ name: 'getState', success: true, timestamp: Date.now() });
    } catch (err) {
      setLastAction({ name: 'getState', error: err?.message || String(err), timestamp: Date.now() });
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up live event listeners
  useEffect(() => {
    let listeners = [];

    const setupListeners = async () => {
      try {
        const l1 = await ExamLock.addListener('pinningExited', (data) => {
          appendEvent('pinningExited', data);
          refreshState();
        });
        const l2 = await ExamLock.addListener('multiWindowChanged', (data) => {
          appendEvent('multiWindowChanged', data);
          refreshState();
        });
        const l3 = await ExamLock.addListener('windowFocusChanged', (data) => {
          appendEvent('windowFocusChanged', data);
          refreshState();
        });
        const l4 = await ExamLock.addListener('activityPaused', (data) => {
          appendEvent('activityPaused', data);
        });
        const l5 = await ExamLock.addListener('activityResumed', (data) => {
          appendEvent('activityResumed', data);
          refreshState();
        });
        const l6 = await ExamLock.addListener('screenCaptured', (data) => {
          appendEvent('screenCaptured (Android 14+)', data);
        });

        listeners = [l1, l2, l3, l4, l5, l6].filter(Boolean);
      } catch (err) {
        console.warn('[ExamLock] Could not register event listeners:', err);
      }
    };

    setupListeners();
    refreshState();

    return () => {
      listeners.forEach((l) => {
        try {
          if (typeof l?.remove === 'function') l.remove();
        } catch {
          // best-effort
        }
      });
    };
  }, [appendEvent, refreshState]);

  const handleEnableSecure = async () => {
    try {
      setLoading(true);
      const res = await ExamLock.enableSecure();
      setLastAction({ name: 'enableSecure', result: res, timestamp: Date.now() });
      await refreshState();
    } catch (err) {
      setLastAction({ name: 'enableSecure', error: err?.message || String(err), timestamp: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  const handleDisableSecure = async () => {
    try {
      setLoading(true);
      const res = await ExamLock.disableSecure();
      setLastAction({ name: 'disableSecure', result: res, timestamp: Date.now() });
      await refreshState();
    } catch (err) {
      setLastAction({ name: 'disableSecure', error: err?.message || String(err), timestamp: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  const handleStartPinning = async () => {
    try {
      setLoading(true);
      const res = await ExamLock.startPinning();
      setLastAction({ name: 'startPinning', result: res, timestamp: Date.now() });
      await refreshState();
    } catch (err) {
      setLastAction({ name: 'startPinning', error: err?.message || String(err), timestamp: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  const handleStopPinning = async () => {
    try {
      setLoading(true);
      const res = await ExamLock.stopPinning();
      setLastAction({ name: 'stopPinning', result: res, timestamp: Date.now() });
      await refreshState();
    } catch (err) {
      setLastAction({ name: 'stopPinning', error: err?.message || String(err), timestamp: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  const clearLog = () => {
    setEvents([]);
  };

  const getEventBadgeColor = (name) => {
    if (name.includes('pinningExited') || name.includes('activityPaused')) {
      return 'bg-destructive/15 text-destructive border-destructive/30';
    }
    if (name.includes('activityResumed')) {
      return 'bg-success/15 text-success border-success/30';
    }
    if (name.includes('windowFocusChanged')) {
      return 'bg-primary/15 text-primary border-primary/30';
    }
    if (name.includes('screenCaptured')) {
      return 'bg-warning/20 text-warning border-warning/40';
    }
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col exam-portal-root">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-30 px-3 sm:px-4 py-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              iconName="ArrowLeft"
              onClick={() => navigate('/app-spike')}
              className="touch-target shrink-0"
              title="Back"
            />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">ExamLock Plugin Spike</h1>
              <p className="text-xs text-muted-foreground truncate">
                Native Android lockdown verification harness
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                isNative
                  ? 'bg-success/15 text-success border-success/30'
                  : 'bg-warning/15 text-warning border-warning/30'
              }`}
            >
              {isNative ? 'Native Android' : 'Web Mock'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-4 space-y-4">
        {/* Live State Card */}
        <section className="bg-card border border-border rounded-xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Icon name="Shield" size={16} className="text-primary" />
              <span>Current Plugin State</span>
            </h2>
            <Button
              variant="outline"
              size="sm"
              iconName="RefreshCw"
              onClick={refreshState}
              loading={loading}
              className="text-xs touch-target"
            >
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 text-xs">
            {/* FLAG_SECURE */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
              <p className="text-muted-foreground mb-1">FLAG_SECURE</p>
              <div className="flex items-center gap-1.5 font-bold">
                <span
                  className={`w-2 h-2 rounded-full ${
                    state.secure ? 'bg-success animate-pulse' : 'bg-muted-foreground/40'
                  }`}
                />
                <span className={state.secure ? 'text-success' : 'text-muted-foreground'}>
                  {state.secure ? 'ACTIVE (Blocked)' : 'INACTIVE'}
                </span>
              </div>
            </div>

            {/* Lock Task Mode */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
              <p className="text-muted-foreground mb-1">Lock Task Mode</p>
              <div className="flex items-center gap-1.5 font-bold">
                <span
                  className={`w-2 h-2 rounded-full ${
                    state.lockTaskMode === 'pinned'
                      ? 'bg-success animate-pulse'
                      : state.lockTaskMode === 'locked'
                      ? 'bg-primary animate-pulse'
                      : 'bg-muted-foreground/40'
                  }`}
                />
                <span
                  className={
                    state.lockTaskMode === 'pinned'
                      ? 'text-success'
                      : state.lockTaskMode === 'locked'
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  }
                >
                  {state.lockTaskMode?.toUpperCase()} ({state.lockTaskModeCode ?? 0})
                </span>
              </div>
            </div>

            {/* Multi-Window */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
              <p className="text-muted-foreground mb-1">Multi-Window</p>
              <div className="flex items-center gap-1.5 font-bold">
                <span
                  className={state.inMultiWindow ? 'text-destructive' : 'text-muted-foreground'}
                >
                  {state.inMultiWindow ? 'DETECTED' : 'No (Full Screen)'}
                </span>
              </div>
            </div>

            {/* PiP */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
              <p className="text-muted-foreground mb-1">Picture-in-Picture</p>
              <div className="flex items-center gap-1.5 font-bold">
                <span className={state.inPip ? 'text-destructive' : 'text-muted-foreground'}>
                  {state.inPip ? 'ACTIVE' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* Interruption Filter */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border col-span-2 sm:col-span-1">
              <p className="text-muted-foreground mb-1">Interruption Filter</p>
              <div className="flex items-center gap-1.5 font-bold">
                <span className="text-foreground">
                  {state.interruptionFilterName || state.interruptionFilter || 'ALL'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Action Controls */}
        <section className="bg-card border border-border rounded-xl p-3.5 sm:p-4 shadow-xs">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Icon name="Sliders" size={16} className="text-primary" />
            <span>Plugin Actions</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
            <Button
              variant="default"
              size="sm"
              iconName="Lock"
              onClick={handleEnableSecure}
              disabled={loading}
              className="touch-target text-xs font-semibold"
            >
              Enable Secure
            </Button>
            <Button
              variant="outline"
              size="sm"
              iconName="Unlock"
              onClick={handleDisableSecure}
              disabled={loading}
              className="touch-target text-xs font-semibold"
            >
              Disable Secure
            </Button>
            <Button
              variant="default"
              size="sm"
              iconName="Pin"
              onClick={handleStartPinning}
              disabled={loading}
              className="touch-target text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Start Pinning
            </Button>
            <Button
              variant="destructive"
              size="sm"
              iconName="XCircle"
              onClick={handleStopPinning}
              disabled={loading}
              className="touch-target text-xs font-semibold"
            >
              Stop Pinning
            </Button>
          </div>

          {lastAction && (
            <div className="mt-3 p-2 bg-muted/30 border border-border rounded text-[11px] flex items-center justify-between text-muted-foreground">
              <span>
                Last call: <strong className="text-foreground">{lastAction.name}</strong>{' '}
                {lastAction.error ? (
                  <span className="text-destructive font-bold">Failed: {lastAction.error}</span>
                ) : (
                  <span className="text-success font-medium">OK</span>
                )}
              </span>
              <span>{new Date(lastAction.timestamp).toLocaleTimeString()}</span>
            </div>
          )}
        </section>

        {/* Live Event Stream */}
        <section className="bg-card border border-border rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Icon name="Activity" size={16} className="text-primary" />
                <span>Live Event Log</span>
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-medium">
                {events.length}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconName="Trash2"
              onClick={clearLog}
              disabled={events.length === 0}
              className="text-xs touch-target"
            >
              Clear
            </Button>
          </div>

          <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
            {events.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs">
                <Icon name="Radio" size={28} className="mx-auto mb-2 opacity-40 animate-pulse" />
                <p>Waiting for events (pinningExited, windowFocusChanged, activityPaused...)</p>
                <p className="mt-1 text-[11px] opacity-70">
                  Trigger an action above or pull down the notification shade.
                </p>
              </div>
            ) : (
              events.map((evt) => (
                <div
                  key={evt.id}
                  className="p-2.5 rounded-lg border border-border/80 bg-background/50 space-y-1.5 animate-in fade-in"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${getEventBadgeColor(
                        evt.name
                      )}`}
                    >
                      {evt.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-[11px] font-mono text-muted-foreground bg-muted/50 p-1.5 rounded overflow-x-auto">
                    {JSON.stringify(evt.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
            <div ref={eventsEndRef} />
          </div>
        </section>

        {/* Quick Instructions */}
        <section className="bg-muted/30 border border-border rounded-xl p-3 sm:p-4 text-xs text-muted-foreground space-y-1.5">
          <h3 className="font-semibold text-foreground flex items-center gap-1.5">
            <Icon name="Info" size={14} className="text-primary" />
            <span>Test Scenarios Quick Reference</span>
          </h3>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Power + Volume Down</strong>: Take a screenshot to test FLAG_SECURE (should be black or blocked).</li>
            <li><strong>Start Pinning</strong>: Triggers system screen pinning. Try exiting via gesture to verify <code>pinningExited</code> event.</li>
            <li><strong>Notification Shade</strong>: Pull shade from top to verify <code>windowFocusChanged(hasFocus: false)</code>.</li>
            <li><strong>Home / Switch App</strong>: Minimize to test <code>activityPaused</code> and <code>activityResumed</code>.</li>
          </ul>
        </section>
      </main>
    </div>
  );
};

export default ExamLockSpikePage;
